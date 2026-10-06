import Link from 'next/link';
import { ShieldCheck, ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)] p-6 md:p-12">
      <div className="max-w-2xl mx-auto space-y-6">
        <Link
          href="/feed"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--brand)] hover:underline mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to ResponSys
        </Link>

        <div className="flex items-center gap-3 pb-4 border-b border-[var(--border)]">
          <div className="w-10 h-10 rounded-lg bg-[var(--brand-soft)] text-[var(--brand)] flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Privacy Policy &amp; Data Protection</h1>
            <p className="text-xs text-[var(--fg-muted)]">
              Digital Personal Data Protection Act (DPDP Act) 2023 Compliance
            </p>
          </div>
        </div>

        <section className="space-y-3 text-xs leading-relaxed text-[var(--fg-muted)]">
          <h2 className="text-sm font-semibold text-[var(--fg)]">1. Purpose of Data Collection</h2>
          <p>
            ResponSys is operated on behalf of municipal civic infrastructure coordination. We collect personal data
            solely to verify civic incident locations, triage reported hazards, and coordinate nearby field volunteer dispatch.
          </p>
        </section>

        <section className="space-y-3 text-xs leading-relaxed text-[var(--fg-muted)]">
          <h2 className="text-sm font-semibold text-[var(--fg)]">2. Geolocation and Camera Evidence</h2>
          <p>
            To prevent fraud and duplicate dispatch, reports require server-verified geolocation coordinates acquired at
            the moment of photo capture. For volunteer participants, coordinates are rounded to 2 decimal places (~1.1 km)
            in public views, with precise coordinates accessible only to authorized municipal dispatchers.
          </p>
        </section>

        <section className="space-y-3 text-xs leading-relaxed text-[var(--fg-muted)]">
          <h2 className="text-sm font-semibold text-[var(--fg)]">3. Metadata and EXIF Stripping</h2>
          <p>
            All photos captured through the platform are automatically processed by our backend engine. All embedded EXIF
            tags (including device serial numbers, camera model, and device timestamps) are permanently stripped before
            storage.
          </p>
        </section>

        <section className="space-y-3 text-xs leading-relaxed text-[var(--fg-muted)]">
          <h2 className="text-sm font-semibold text-[var(--fg)]">4. Data Subject Rights &amp; Deletion</h2>
          <p>
            Under the DPDP Act 2023, you have the right to access, correct, or request deletion of your personal data.
            You can withdraw from volunteering or request soft-deletion of your account anytime in your profile settings.
          </p>
        </section>

        <div className="pt-6 border-t border-[var(--border)] text-[11px] text-[var(--fg-muted)]">
          Last updated: October 2026 · Tirupati Municipal Corporation Civic Operations
        </div>
      </div>
    </div>
  );
}
