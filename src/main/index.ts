import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    frame: false, // Custom Title Bar
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // Track current download process
  let currentDownloadProcess: any = null

  ipcMain.on('cancel-download', () => {
    if (currentDownloadProcess) {
        console.log('Cancelling download...')
        currentDownloadProcess.kill() // Sends SIGTERM
        currentDownloadProcess = null
    }
  })

  ipcMain.handle('download-playlist', async (_, url) => {
    const { spawn } = require('child_process')
    const { existsSync, mkdirSync } = require('fs')
    const path = require('path')
    
    try {
      const musicPath = app.getPath('music')
      const downloadPath = join(musicPath, 'YotoLocal')
      
      if (!existsSync(downloadPath)) {
        mkdirSync(downloadPath, { recursive: true })
      }

      // Resolve yt-dlp binary path
      const isDev = !app.isPackaged
      const binaryPath = isDev
        ? join(__dirname, '../../resources/bin/yt-dlp.exe')
        : join(process.resourcesPath, 'bin/yt-dlp.exe')

      console.log(`Using binary at: ${binaryPath}`)
      console.log(`Starting download for: ${url} to ${downloadPath}`)

      if (!existsSync(binaryPath)) {
        throw new Error(`yt-dlp binary not found at ${binaryPath}`)
      }

      return new Promise((resolve, reject) => {
        const args = [
            url,
            '--extract-audio',
            '--audio-format', 'mp3',
            // Use Playlist metadata for consistent folder structure
            '--output', join(downloadPath, '%(playlist_uploader,uploader)s', '%(playlist_title,title)s', '%(title)s.%(ext)s'),
            
            // '--write-thumbnail', // Don't write separate file
            // '--convert-thumbnails', 'jpg',
            '--embed-thumbnail', // Only embed in MP3
            
            '--no-check-certificates',
            '--no-warnings',
            '--add-header', 'referer:youtube.com',
            '--add-header', 'user-agent:googlebot',
            '--ffmpeg-location', path.dirname(binaryPath)
        ]

        let totalVideos = 1
        let currentVideoIndex = 1

        const child = spawn(binaryPath, args)
        currentDownloadProcess = child
        let stderr = ''

        child.stdout.on('data', (data) => {
            const output = data.toString()
            console.log(`stdout: ${output}`)
            
            // Regex to catch "Downloading video 3 of 15" or "Downloading item 3 of 15"
            // yt-dlp might use different wording depending on version/config
            const playlistMatch = output.match(/Downloading (?:video|item) (\d+) of (\d+)/i)
            
            if (playlistMatch) {
                currentVideoIndex = parseInt(playlistMatch[1])
                totalVideos = parseInt(playlistMatch[2])
                console.log(`Track Progress: ${currentVideoIndex}/${totalVideos}`)
            }

            // Parse file progress: "[download]  23.5% of 10.00MiB"
            const progressMatch = output.match(/\[download\]\s+(\d+\.\d+)%/)
            if (progressMatch && progressMatch[1]) {
                const filePercent = parseFloat(progressMatch[1])
                
                // Calculate global progress
                // Total % = ((Videos Completed * 100) + Current Video %) / Total Videos
                // Ensure default of 1 if totalVideos is missing to avoid division by zero or NaN
                const safeTotal = totalVideos > 0 ? totalVideos : 1
                const videosCompleted = Math.max(0, currentVideoIndex - 1)
                
                // Cap at 100% just in case
                let globalPercent = ((videosCompleted * 100) + filePercent) / safeTotal
                globalPercent = Math.min(100, Math.max(0, globalPercent))
                
                _.sender.send('download-progress', globalPercent)
            }
        })

        child.stderr.on('data', (data) => {
            const output = data.toString()
            console.error(`stderr: ${output}`)
            stderr += output
        })

        child.on('close', (code, signal) => {
            currentDownloadProcess = null
            if (code === 0) {
                resolve({ success: true, path: downloadPath })
            } else if (signal === 'SIGTERM') {
                reject(new Error('Download cancelled by user')) 
            } else {
                reject(new Error(`Process exited with code ${code}. Error: ${stderr}`))
            }
        })
      })
    } catch (error: any) {
      console.error('Download failed:', error)
      const errorMessage = error.stderr || error.message || 'Unknown download error'
      throw new Error(errorMessage)
    }
  })

  // Library Scanner IPC
  ipcMain.handle('get-local-library', async () => {
     const { readdirSync, statSync, existsSync, readFileSync } = require('fs')
     const { join, basename, dirname } = require('path')
     const { default: Store } = await import('electron-store')
     const { parseBuffer } = await import('music-metadata')
     
     const store = new Store()
     
     try {
       const musicPath = app.getPath('music')
       const libraryPath = join(musicPath, 'YotoLocal')
       
       if (!existsSync(libraryPath)) return []

       const syncStatus = store.get('syncStatus', {}) as Record<string, any>
       const albums: any[] = []

       console.log('Scanning Library Path:', libraryPath)

       // Recursive function to find albums (folders containing mp3s)
       const findAlbums = async (dir: string) => {
           let files: string[] = []
           try {
               files = readdirSync(dir)
           } catch (e) {
               console.error('Error reading dir:', dir, e)
               return 
           }

           const mp3s = files.filter(f => f.toLowerCase().endsWith('.mp3'))
           
           if (mp3s.length > 0) {
               console.log('Found Album:', dir)
               const albumName = basename(dir)
               const parentDir = basename(dirname(dir))
               const isDirectChild = dirname(dir) === libraryPath
               // If strict artist grouping is desired later, we can use this
               const artistName = isDirectChild ? 'Unsorted' : parentDir

               // 1. Try to find local art file first
               let artUrl: string | null = null
               const artFile = files.find(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
               
               if (artFile) {
                   artUrl = `file://${join(dir, artFile).replace(/\\/g, '/')}`
               } else {
                   // 2. Extract from first MP3
                   try {
                       const firstMp3Path = join(dir, mp3s[0])
                       // We trigger this scan on load, so be careful with perf.
                       // Ideally this should be cached.
                       const buffer = readFileSync(firstMp3Path) 
                       const metadata = await parseBuffer(buffer, { mimeType: 'audio/mpeg' })
                       
                       const picture = metadata.common.picture?.[0]
                       if (picture && picture.data) {
                           const base64 = Buffer.from(picture.data).toString('base64')
                           // format usually 'image/jpeg' or 'image/png'
                           const mime = picture.format || 'image/jpeg'
                           artUrl = `data:${mime};base64,${base64}`
                           console.log(`Extracted Art for ${albumName}: ${mime}, Length: ${base64.length}`)
                       } else {
                           console.log(`No art found in MP3 for ${albumName}`)
                       }
                   } catch (e) {
                       console.error('Failed to extract art from MP3:', albumName, e)
                   }
               }

               const tracks = mp3s.map(f => ({
                   name: f.replace('.mp3', ''),
                   path: `file://${join(dir, f).replace(/\\/g, '/')}`
               }))

               albums.push({
                   name: albumName,
                   artist: artistName,
                   art: artUrl,
                   path: dir,
                   trackCount: tracks.length,
                   tracks: tracks,
                   isSynced: (syncStatus[dir] || {}).synced
               })
           }

           // Recurse into subdirectories
           for (const file of files) {
               const fullPath = join(dir, file)
               try {
                   if (statSync(fullPath).isDirectory()) {
                       // Await the recursive call!
                       await findAlbums(fullPath)
                   }
               } catch (e) {
                   console.error('Error stating file:', fullPath)
               }
           }
       }

       await findAlbums(libraryPath)
       console.log('Library Scan Complete. Found albums:', albums.length)
       return albums // Return flat list
       
     } catch (error) {
       console.error('Library scan failed:', error)
       return []
     }
  })

  // Update Album Art IPC
  ipcMain.handle('update-album-art', async (_, { albumPath, imageUrl }) => {
     const { writeFile } = require('fs/promises')
     const { join } = require('path')
     
     try {
         const response = await fetch(imageUrl)
         const buffer = await response.arrayBuffer()
         // Save as folder.jpg to overwrite or become default
         const targetPath = join(albumPath, 'folder.jpg')
         await writeFile(targetPath, Buffer.from(buffer))
         return { success: true, path: `file://${targetPath.replace(/\\/g, '/')}` }
     } catch (error: any) {
         console.error('Failed to update art:', error)
         throw new Error(error.message)
     }
  })

  // Sync to Yoto (Auto-Upload)
  ipcMain.handle('sync-to-yoto', async (_, { albumPath, albumName, albumArtUrl, accessToken, tracks }) => {
     const { readFileSync } = require('fs')
     const crypto = require('crypto')
     
     console.log(`[Sync] Starting sync for "${albumName}" with ${tracks.length} tracks.`)
     
     try {
         // 1. Validate Auth first
         const userRes = await fetch('https://login.yotoplay.com/userinfo', {
             headers: { 'Authorization': `Bearer ${accessToken}` }
         })
         if (!userRes.ok) throw new Error('Authentication failed (403). Relogin required.')

         // 2. Upload Tracks
         const uploadedTrackIds: string[] = []
         
         for (let i = 0; i < tracks.length; i++) {
             const track = tracks[i]
             const filePath = track.path.replace('file://', '')
             console.log(`[Sync] Processing track ${i + 1}/${tracks.length}: ${track.name}`)
             
             // A. Prepare File & Hash
             const fileBuffer = readFileSync(filePath)
             const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex')
             
             // B. Request Upload URL
             // Docs: GET /media/transcode/audio/uploadUrl?sha256=...&filename=...
             // Header: Authorization: Bearer <ACCESS_TOKEN>
             const params = new URLSearchParams({
                 sha256: sha256,
                 filename: `${track.name}.mp3`
             })

             const url = `https://api.yotoplay.com/media/transcode/audio/uploadUrl?${params.toString()}`
             
             const initRes = await fetch(url, {
                 method: 'GET', // Changed from POST
                 headers: { 
                     'Authorization': `Bearer ${accessToken}`, // Reverted to AccessToken
                     'Accept': 'application/json'
                 }
             })

             if (!initRes.ok) {
                 const errText = await initRes.text()
                 console.error('[Sync] Upload Init Failed:', errText)
                 throw new Error(`Failed to initialize upload for ${track.name}: ${initRes.status} - ${errText}`)
             }

             const responseData = await initRes.json()
             console.log('[Sync] Upload Init Response:', JSON.stringify(responseData, null, 2))
             
             if (!responseData.upload || !responseData.upload.uploadId) {
                 throw new Error(`API returned success but missing 'upload.uploadId'. Response: ${JSON.stringify(responseData)}`)
             }
             
             const { uploadUrl, uploadId } = responseData.upload
             
             console.log(`[Sync] Got Upload ID: ${uploadId}`)

             if (uploadUrl) {
                 // C. Upload File
                 console.log(`[Sync] Uploading bytes to ${uploadUrl.substring(0, 50)}...`)
                 const uploadRes = await fetch(uploadUrl, {
                     method: 'PUT',
                     body: fileBuffer as any,
                     headers: { 'Content-Type': 'audio/mpeg' }
                 })

                 if (!uploadRes.ok) {
                     throw new Error(`Failed to upload bytes for ${track.name}: ${uploadRes.status}`)
                 }
                 console.log(`[Sync] Uploaded ${track.name}.`)
             } else {
                 console.log(`[Sync] uploadUrl is null. File likely already exists. Skipping upload.`)
             }
             
             // D. Track Success
             uploadedTrackIds.push(uploadId)
             
             // Emit Progress
             const mainWindow = BrowserWindow.getAllWindows()[0]
             if (mainWindow) {
                 mainWindow.webContents.send('sync-progress', {
                     albumPath: albumPath || albumName, // Prefer unique path
                     current: i + 1,
                     total: tracks.length,
                     filename: track.name
                 })
             }
             
             await new Promise(r => setTimeout(r, 1000))
         }

         console.log('[Sync] All tracks uploaded. IDs:', uploadedTrackIds)

         // 3. Create Playlist
         // Docs imply a structure like { title, description, content: { tracks: [...] } } or similar.
         // Based on common Yoto API patterns (and lack of perfect docs), we'll try:
         // POST https://api.yotoplay.com/playlists
         // Body: { title, tracks: [ { title, uploadId } ] }
         
         // 3. Create Playlist (MYO Card Content)
         // Search results indicate the correct endpoint is POST /content
         // Structure: { title, content: { chapters: [ { title, tracks: [ ... ] } ] } }
         
         // 2.5 Upload Cover Art (Optional)
         let coverImageUrl = null
         if (albumArtUrl) {
             try {
                console.log('[Sync] Processing Cover Art...')
                let artBuffer: Buffer | null = null
                let contentType = 'image/jpeg'

                if (albumArtUrl.startsWith('file://')) {
                    const artPath = albumArtUrl.replace('file://', '')
                    artBuffer = readFileSync(artPath)
                } else if (albumArtUrl.startsWith('data:')) {
                    // data:image/jpeg;base64,....
                    const matches = albumArtUrl.match(/^data:(.+);base64,(.+)$/)
                    if (matches) {
                        contentType = matches[1]
                        artBuffer = Buffer.from(matches[2], 'base64')
                    }
                }

                if (artBuffer) {
                    // Emit Art Progress
                    const mainWindow = BrowserWindow.getAllWindows()[0]
                    if (mainWindow) {
                        mainWindow.webContents.send('sync-progress', {
                            albumPath: albumPath || albumName,
                            current: tracks.length,
                            total: tracks.length,
                            filename: 'Uploading Artwork...',
                            status: 'artwork'
                        })
                    }

                    console.log(`[Sync] Uploading Art (${artBuffer.length} bytes)...`)
                    const artRes = await fetch('https://api.yotoplay.com/media/coverImage/user/me/upload?autoconvert=true', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': contentType
                        },
                        body: artBuffer as any
                    })

                    if (artRes.ok) {
                        const artData = await artRes.json()
                        console.log('[Sync] Art Upload Response:', JSON.stringify(artData, null, 2))
                        
                        // Fix: Response is wrapped in "coverImage"
                        const mediaUrl = artData.coverImage?.mediaUrl || artData.mediaUrl || artData.url
                        
                        if (mediaUrl) {
                            coverImageUrl = mediaUrl
                            console.log('[Sync] Art Uploaded:', coverImageUrl)
                        } else {
                            console.warn('[Sync] API returned success but could not find mediaUrl in response.')
                        }
                    } else {
                        console.warn('[Sync] Art upload failed:', await artRes.text())
                    }
                }
             } catch (e) {
                 console.error('[Sync] Failed to process art:', e)
             }
         }

         const playlistPayload: any = {
             title: albumName,
             content: {
                 chapters: [
                     {
                         key: "chapter-1", // required field
                         title: "Chapter 1",
                         tracks: tracks.map((t, index) => ({
                             key: `track-${index + 1}`, // required field
                             title: t.name,
                             trackUrl: "http://yoto.local/placeholder", 
                             id: uploadedTrackIds[index],
                             type: 'audio'
                         }))
                     }
                 ]
             }
         }

         if (coverImageUrl) {
             playlistPayload.metadata = {
                 cover: {
                     imageL: coverImageUrl
                 }
             }
         }

         if (coverImageUrl) {
             playlistPayload.metadata = {
                 cover: {
                     imageL: coverImageUrl
                 }
             }
         }

         const createRes = await fetch('https://api.yotoplay.com/content', {
             method: 'POST',
             headers: { 
                 'Authorization': `Bearer ${accessToken}`,
                 'Content-Type': 'application/json' 
             },
             body: JSON.stringify(playlistPayload)
         })

         if (!createRes.ok) {
             const errText = await createRes.text()
             throw new Error(`Failed to create content: ${createRes.status} - ${errText}`)
         }

         const createData = await createRes.json()
         console.log('[Sync] Playlist Created!', createData)
         
         const remoteId = createData.id || createData.card?.id // Extract remote ID

         return { success: true, message: 'Playlist created successfully! Check your Yoto App.', remoteId }

     } catch (error: any) {
         console.error('[Sync] Error:', error)
         return { success: false, error: error.message || 'Unknown sync error' }
     }
  })

  // Update Sync Status IPC
  ipcMain.handle('update-sync-status', async (_, { albumPath, synced, remoteId }) => {
     const { default: Store } = await import('electron-store')
     const store = new Store()
     const syncStatus = store.get('syncStatus', {}) as Record<string, any>
     
     syncStatus[albumPath] = { 
         synced, 
         lastSynced: new Date().toISOString(),
         remoteId: remoteId || syncStatus[albumPath]?.remoteId 
     }
     store.set('syncStatus', syncStatus)
     return true
  })

  // Delete Playlist by Path
  ipcMain.handle('delete-playlist-by-path', async (_, { albumPath, accessToken }) => {
       try {
           const { default: Store } = await import('electron-store')
           const store = new Store()
           const syncStatus = store.get('syncStatus', {}) as Record<string, any>
           
           const record = syncStatus[albumPath]
           if (!record || !record.remoteId) {
               console.warn(`[Sync] No remoteId found for ${albumPath}. Skipping remote delete.`)
               return { success: false, error: 'No remote ID' }
           }

           const remoteId = record.remoteId
           console.log(`[Sync] Deleting Playlist ID: ${remoteId} for path: ${albumPath}`)
           
           const res = await fetch(`https://api.yotoplay.com/content/${remoteId}`, {
               method: 'DELETE',
               headers: {
                   'Authorization': `Bearer ${accessToken}`
               }
           })
           
           if (!res.ok) {
               if (res.status !== 404) {
                    const text = await res.text()
                    throw new Error(`Failed to delete: ${res.status} - ${text}`)
               }
           }
           console.log('[Sync] Remote playlist deleted.')
           return { success: true }
       } catch (e: any) {
           console.error('[Sync] Delete Failed:', e)
           return { success: false, error: e.message }
       }
  })

  // Delete Local Album
  ipcMain.handle('delete-local-album', async (_, albumPath) => {
      const { rm } = require('fs/promises')
      try {
          console.log('[Local Delete] Deleting:', albumPath)
          await rm(albumPath, { recursive: true, force: true })
          return { success: true }
      } catch (e: any) {
          console.error('[Local Delete] Failed:', e)
          return { success: false, error: e.message }
      }
  })

  // Auth Token Exchange IPC
  ipcMain.handle('exchange-token', async (_, { code, codeVerifier, clientId, redirectUri }) => {
    try {
      const response = await fetch("https://login.yotoplay.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          code_verifier: codeVerifier,
          code: code,
          redirect_uri: redirectUri,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Server responded with ${response.status}: ${text}`);
      }

      return await response.json();
    } catch (error: any) {
      console.error("Token exchange failed:", error);
      throw new Error(error.message || "Token exchange failed");
    }
  });

  // Close App IPC
  ipcMain.on('close-app', () => {
      app.quit()
  })

  // Minimize App IPC
  ipcMain.on('minimize-app', () => {
      BrowserWindow.getFocusedWindow()?.minimize()
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
