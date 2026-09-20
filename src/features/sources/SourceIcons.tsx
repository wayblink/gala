import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function IconBase({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      {children}
    </svg>
  )
}

export function EditIcon(props: IconProps) {
  return <IconBase {...props}><path d="m4 16.5-.8 3.8 3.8-.8L18.5 8a2.1 2.1 0 0 0-3-3L4 16.5Z" /><path d="m13.5 6.5 4 4" /></IconBase>
}

export function RelinkIcon(props: IconProps) {
  return <IconBase {...props}><path d="m9 15 6-6" /><path d="M7.5 17.5h-1a4 4 0 0 1 0-8h3" /><path d="M16.5 6.5h1a4 4 0 0 1 0 8h-3" /></IconBase>
}

export function RescanIcon(props: IconProps) {
  return <IconBase {...props}><path d="M20 11a8 8 0 1 0 1 4" /><path d="M20 5v6h-6" /></IconBase>
}

export function DeleteIcon(props: IconProps) {
  return <IconBase {...props}><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="m6 7 1 13h10l1-13M9 7V4h6v3" /></IconBase>
}

export function FolderIcon(props: IconProps) {
  return <IconBase {...props}><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H10l2 2h7.5A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-11Z" /></IconBase>
}

export function CloseIcon(props: IconProps) {
  return <IconBase {...props}><path d="m6 6 12 12M18 6 6 18" /></IconBase>
}
