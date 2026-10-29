import Link from "next/link";

const links = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/legal/creator-terms", label: "Creator terms" },
  { href: "/legal/abuse", label: "Abuse rules" },
];

export function LegalFooter({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Legal">
      <ul className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted ${className}`}>
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="underline-offset-2 hover:text-foreground hover:underline">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
