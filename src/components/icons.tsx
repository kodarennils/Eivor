// Small inline outline icons for the landing page's workflow steps.
// Kept dependency-free (no icon library) since only four are needed.

type IconProps = { className?: string };

export function DescribeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 9h8M8 13h5m-9 7 2.5-2.5H18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v11.5c0 .69.56 1.25 1.25 1.25H6"
      />
    </svg>
  );
}

export function AssessmentIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3 4 6v6c0 4.5 3.2 7.7 8 9 4.8-1.3 8-4.5 8-9V6l-8-3Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function FormIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 3h6a2 2 0 0 1 2 2v14l-4-2-2 2-2-2-4 2V5a2 2 0 0 1 2-2Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 8h6M9 11.5h6" />
    </svg>
  );
}

export function SubmitIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6.5L14 12l-10 1.5V20l18-8Z" />
    </svg>
  );
}

export function ArrowUpIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0-6 6m6-6 6 6" />
    </svg>
  );
}

export function BuildingIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 22V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v18M6 22h14M14 22V13h5a1 1 0 0 1 1 1v8M9 7h.01M9 11h.01M9 15h.01"
      />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function RulerIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.3 15.3 15.3 21.3a1 1 0 0 1-1.42 0L2.7 10.12a1 1 0 0 1 0-1.42L8.7 2.7a1 1 0 0 1 1.42 0L21.3 13.88a1 1 0 0 1 0 1.42Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.5 11.5 2-2M11 8l2-2M7.5 4.5l2-2M18 15l2-2" />
    </svg>
  );
}

export function FileTextIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 2v6h6M8 13h8M8 17h8M8 9h1" />
    </svg>
  );
}

export function PaperclipIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m21.44 11.05-9.19 9.19a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.19 9.19a1.5 1.5 0 0 1-2.13-2.12l8.49-8.49"
      />
    </svg>
  );
}

export function UploadIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0-12 4 4m-4-4-4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

export function PhotoIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 15-5-5L5 21" />
    </svg>
  );
}

// Google's brand mark uses fixed brand colors, not currentColor.
export function GoogleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.92l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.95H1.26v3.1C3.24 21.3 7.29 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28v-3.1H1.26A11.98 11.98 0 0 0 0 12c0 1.94.47 3.77 1.26 5.38l4.01-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.23 0 12 0 7.29 0 3.24 2.7 1.26 6.62l4.01 3.1C6.22 6.88 8.87 4.77 12 4.77Z"
      />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function MenuIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function LogOutIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
      />
    </svg>
  );
}
