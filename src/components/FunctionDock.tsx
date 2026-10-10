import type { ReactNode } from 'react'

type FunctionDockProps = {
  children?: ReactNode
}

/**
 * FunctionDock — 底部居中的"功能控制框"（对标 proma 的聊天输入框）。
 * 通用容器：不同功能/插件往里注册各自的控件（Similar Review 的分组滑块、
 * All Photos 的搜索/命令、未来插件的控制面板等）。默认空壳，由使用方填充。
 */
export function FunctionDock({ children }: FunctionDockProps) {
  if (!children) return null
  return (
    <div className="function-dock" role="region" aria-label="Function controls">
      {children}
    </div>
  )
}
