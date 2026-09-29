import { describe, expect, it } from 'vitest'
import {
  buildYtDlpArgs,
  overallProgress,
  parseProgressLine,
  stageFromLine
} from '../src/downloads.js'

describe('parseProgressLine', () => {
  it('parses the progress template output', () => {
    expect(parseProgressLine('[progress] 3|15| 42.5%|Some Song | Live')).toEqual({
      current: 3,
      total: 15,
      percent: 42.5,
      title: 'Some Song | Live'
    })
  })

  it('treats missing playlist fields as a single item', () => {
    expect(parseProgressLine('[progress] NA|NA|100.0%|Video')).toMatchObject({
      current: 1,
      total: 1
    })
  })

  it('ignores other output', () => {
    expect(parseProgressLine('[download] Destination: foo.webm')).toBeNull()
  })
})

describe('overallProgress', () => {
  it('combines item index and item percent', () => {
    expect(overallProgress(1, 4, 50)).toBe(12.5)
    expect(overallProgress(4, 4, 100)).toBe(100)
    expect(overallProgress(1, 0, 50)).toBe(50)
  })
})

describe('stageFromLine', () => {
  it('maps post-processing steps', () => {
    expect(stageFromLine('[ExtractAudio] Destination: a.mp3')).toBe('Converting to MP3')
    expect(stageFromLine('[EmbedThumbnail] ffmpeg: Adding thumbnail')).toBe('Embedding artwork')
    expect(stageFromLine('[info] something')).toBeNull()
  })
})

describe('buildYtDlpArgs', () => {
  it('puts the URL after -- so it can never be read as an option', () => {
    const args = buildYtDlpArgs('https://youtu.be/x', '/lib', '/bin/ffmpeg')
    expect(args.slice(-2)).toEqual(['--', 'https://youtu.be/x'])
    expect(args).toContain('--embed-thumbnail')
    expect(args[args.indexOf('--ffmpeg-location') + 1]).toBe('/bin')
  })
})
