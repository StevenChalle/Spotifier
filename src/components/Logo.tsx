export default function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        aria-hidden="true"
        className="flex h-9 w-9 items-end justify-center gap-[3px] rounded-xl bg-accent pb-2"
      >
        <span className="h-3 w-1 rounded-full bg-bg" />
        <span className="h-5 w-1 rounded-full bg-bg" />
        <span className="h-4 w-1 rounded-full bg-bg" />
      </span>
      <span className="text-xl font-extrabold tracking-tight">Spotifier</span>
    </span>
  )
}
