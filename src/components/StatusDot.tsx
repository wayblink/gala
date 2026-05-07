import type { SourceStatus } from '../types'

type StatusDotProps = {
  status: SourceStatus
}

export function StatusDot({ status }: StatusDotProps) {
  return <span className={`status-dot status-dot--${status}`} aria-hidden="true" />
}
