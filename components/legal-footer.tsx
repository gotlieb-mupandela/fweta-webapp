import Link from "next/link";

const links = [
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/creator-terms", label: "Creator terms" },
  { href: "/legal/abuse", label: "Abuse rules" },
];

export function LegalFooter({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs text-muted">Fweta Trading Enterprises CC, Reg. CC/2026/10254</p>
      <nav aria-label="Legal" className="mt-2">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          {links.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="underline-offset-2 hover:text-foreground hover:underline">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
