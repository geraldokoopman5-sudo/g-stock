export type WorkspaceIconName = 'home' | 'inventory' | 'warehouses' | 'employees' | 'sun' | 'moon' | 'grid' | 'arrow' | 'logout' | 'alert' | 'pen' | 'trash' | 'gallery'

const paths: Record<WorkspaceIconName, string[]> = {
  pen: ['m16 3 5 5-12 12-6 1 1-6L16 3Z', 'm13 6 5 5', 'm4 15 5 5'],
  trash: ['M3 6h18', 'M9 6V3h6v3', 'm5 6 1 15h12l1-15', 'M10 10v7M14 10v7'],
  gallery: ['M8 3h13v14', 'M3 7h14v14H3z', 'm3 17 4-4 4 4 2-2 4 4', 'M12 11h.01'],
  alert: ['M12 3 2 21h20L12 3Z', 'M12 9v5M12 17h.01'],
  home: ['m3 10 9-7 9 7', 'M5 9v11h5v-6h4v6h5V9'],
  inventory: ['m12 3 9 5-9 5-9-5 9-5Z', 'M3 8v9l9 5 9-5V8', 'M12 13v9', 'm7.5 5.5 9 5'],
  warehouses: ['M4 21V5l8-2v18M12 9h8v12M2 21h20', 'M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2'],
  employees: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M17 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87'],
  sun: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z', 'M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42'],
  moon: ['M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z'],
  grid: ['M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h6v6h-6z'],
  arrow: ['M5 12h14m-6-6 6 6-6 6'],
  logout: ['M9 4H4v16h5M10 12h11m-4-4 4 4-4 4'],
}

export default function WorkspaceIcon({ name, size = 20 }: { name: WorkspaceIconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name].map((path) => <path key={path} d={path} />)}
    </svg>
  )
}
