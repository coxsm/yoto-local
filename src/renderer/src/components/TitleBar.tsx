import React from 'react'
import { X, Minus } from 'lucide-react'

function TitleBar(): React.JSX.Element {
    const handleClose = (): void => {
        // @ts-ignore
        window.api.closeApp()
    }

    const handleMinimize = (): void => {
        // @ts-ignore
        window.api.minimizeApp()
    }

    return (
        <div className="title-bar flex justify-between items-center px-4 py-1.5 bg-background select-none border-b border-white/5" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
            <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-white/50 tracking-wider uppercase">Yoto Local</span>
            </div>
            <div className="flex items-center gap-1">
                <button
                    onClick={handleMinimize}
                    className="p-1 hover:bg-white/10 rounded-md transition-colors group"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                >
                    <Minus className="w-3.5 h-3.5 text-white/50 group-hover:text-white" />
                </button>
                <button
                    onClick={handleClose}
                    className="p-1 hover:bg-red-500/10 hover:text-red-500 rounded-md transition-colors group"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                >
                    <X className="w-3.5 h-3.5 text-white/50 group-hover:text-red-500" />
                </button>
            </div>
        </div>
    )
}

export default TitleBar
