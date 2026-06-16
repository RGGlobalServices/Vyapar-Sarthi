import Link from "next/link";
import { config } from "@/lib/config";

function WaIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.585 1.927c-.053.177.138.336.31.246l1.921-1.007c.97.578 2.175.885 3.452.885 3.18 0 5.767-2.587 5.768-5.766 0-3.181-2.586-5.764-5.767-5.764Z"/><path d="M9.94 8.6a.697.697 0 0 0-.497.344.72.72 0 0 0-.098.573c.369 1.354 1.064 2.418 1.982 3.113.376.286.794.497 1.18.684.275.133.592.249.84.083.206-.136.352-.358.465-.593.112-.234.057-.436-.009-.594-.045-.106-.174-.286-.514-.53-.476-.342-.793-.53-.903-.719-.085-.146-.039-.267.015-.361.064-.112.146-.225.204-.357.063-.148.017-.282-.022-.37-.05-.112-.172-.427-.285-.696-.146-.348-.46-.502-.695-.558a1.14 1.14 0 0 0-.483-.008c-.098.019-.217.046-.304.226Z"/></svg>; }
function IgIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>; }
function LiIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>; }
function YtIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>; }

const socialLinks = [
  { name: "WhatsApp", href: "https://wa.me/919921142657", icon: <WaIcon /> },
  { name: "Instagram", href: "https://instagram.com/vyaparsarthi", icon: <IgIcon /> },
  { name: "LinkedIn", href: "https://linkedin.com/company/vyaparsarthi", icon: <LiIcon /> },
  { name: "YouTube", href: "https://youtube.com/@vyaparsarthi", icon: <YtIcon /> },
];

const productLinks = [
  { name: "Smart Billing", href: "/#billing" },
  { name: "Inventory", href: "/#inventory" },
  { name: "Udhar Book", href: "/#udhar" },
  { name: "AI Insights", href: "/#ai" },
  { name: "Pricing", href: "/#pricing" },
];

const companyLinks = [
  { name: "About Us", href: "/about" },
  { name: "Blog", href: "/blog" },
];

const supportLinks = [
  { name: "Help Center", href: "/help-center" },
  { name: "Contact Us", href: "/contact" },
  { name: "Privacy Policy", href: "/privacy" },
  { name: "Terms of Service", href: "/terms" },
  { name: "Refund Policy", href: "/refund" },
];

const paymentPartners = ["Google Pay", "PhonePe", "Paytm", "Razorpay"];

export default function Footer() {
  return (
    <footer className="bg-slate-900 border-t border-transparent relative">
      <div className="absolute top-0 left-0 right-0 h-px bg-linear-to-r from-indigo-500 via-cyan-500 to-emerald-500" />
      <div className="max-w-6xl mx-auto px-4 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          <div>
            <h3 className="text-xl font-bold text-slate-100 mb-4">
              <span className="bg-linear-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                Vyapar Sarthi
              </span>
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              Apni Dukan Ko Smart Banao. India&apos;s #1 Kirana shop management app trusted by shop owners.
            </p>
            <div className="flex gap-3 mb-6">
              {socialLinks.map((social) => (
                <a
                  key={social.name}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-sm hover:border-indigo-500/50 hover:bg-indigo-500/10 transition"
                  aria-label={social.name}
                >
                  {social.icon}
                </a>
              ))}
            </div>
            <div className="space-y-2 text-sm">
              <a href="https://wa.me/919921142657" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-slate-400 hover:text-indigo-400 transition">
                <WaIcon /> WhatsApp: +91 9921142657
              </a>
              <a href="mailto:gbroindustries@gmail.com" className="flex items-center gap-2 text-slate-400 hover:text-indigo-400 transition">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                gbroindustries@gmail.com
              </a>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Product</h4>
            <ul className="space-y-3">
              {productLinks.map((link) => (
                <li key={link.name}>
                  <a href={link.href} className="text-slate-400 text-sm hover:text-indigo-400 transition">
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Company</h4>
            <ul className="space-y-3">
              {companyLinks.map((link) => (
                <li key={link.name}>
                  <Link href={link.href} className="text-slate-400 text-sm hover:text-indigo-400 transition">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-6 pt-4 border-t border-slate-800">
              <a
                href={`${config.FRONTEND_URL}/admin`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-linear-to-r from-indigo-500/20 to-cyan-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-semibold hover:from-indigo-500/30 hover:to-cyan-500/30 transition"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                Admin Panel
              </a>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Support</h4>
            <ul className="space-y-3">
              {supportLinks.map((link) => (
                <li key={link.name}>
                  <Link href={link.href} className="text-slate-400 text-sm hover:text-indigo-400 transition">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-slate-800">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Payment Partners</span>
              <div className="flex gap-3">
                {paymentPartners.map((partner) => (
                  <span key={partner} className="text-sm text-slate-400 bg-slate-800 px-3 py-1 rounded-lg">
                    {partner}
                  </span>
                ))}
              </div>
            </div>
            <p className="text-slate-500 text-sm">
              &copy; 2026 Vyapar Sarthi. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
