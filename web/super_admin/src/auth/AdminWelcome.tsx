import type {ReactNode} from 'react';
import {ArrowUpRight,MapPinned,ShieldCheck,Store} from 'lucide-react';
import {LogoBadge} from '../components/ui/Logo';

export function AdminWelcome({children}:{children:ReactNode}) {
  return <main className="grid min-h-screen lg:grid-cols-[minmax(360px,0.95fr)_minmax(440px,1.05fr)]">
    <section className="relative flex flex-col overflow-hidden bg-kraveo-g950 px-6 py-8 text-white sm:px-12 lg:px-14 lg:py-12">
      <div className="pointer-events-none absolute -right-28 top-40 h-80 w-80 rounded-full border border-white/10" aria-hidden="true"/><div className="pointer-events-none absolute -right-8 top-60 h-80 w-80 rounded-full border border-white/10" aria-hidden="true"/>
      <LogoBadge className="w-fit" imgClassName="h-10"/>
      <div className="relative my-auto max-w-lg py-12 lg:py-20"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-kraveo-g200">Grozo marketplace workspace</p><h1 className="mt-5 font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">Your stores.<br/>Your cities.<br/><span className="text-kraveo-g200">One clear view.</span></h1><p className="mt-6 max-w-sm text-base leading-relaxed text-white/75">Keep grocery stores, orders and delivery areas moving together. Give your team the access they need.</p>
      <div className="mt-9 space-y-4">{[[Store,'Vendor management','Onboard stores and keep stock ready.'],[MapPinned,'City operations','See orders and coverage by city.'],[ShieldCheck,'Controlled access','Invite your team with a verified email.']].map(([Icon,title,body]:any)=><div key={title} className="flex items-start gap-3"><span className="rounded-xl bg-white/10 p-2.5"><Icon className="h-5 w-5 text-kraveo-g200"/></span><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-white/65">{body}</p></div></div>)}</div></div>
      <p className="relative text-xs text-white/55">Grozo · Nearby stores. Speedy delivery.</p>
    </section>
    <section className="flex items-center justify-center px-5 py-10 sm:px-12 lg:py-12"><div className="w-full max-w-[440px]">{children}<div className="mt-7 flex items-center gap-2 text-xs text-kraveo-ink3"><ShieldCheck className="h-4 w-4 shrink-0"/><p>Clerk secures sign-in. Your Grozo owner manages access.</p></div><a className="mt-4 inline-flex items-center gap-1 text-xs text-kraveo-ink3 underline-offset-4 hover:underline" href="https://grozo-admin.vercel.app/">Grozo administration<ArrowUpRight className="h-3 w-3"/></a></div></section>
  </main>;
}
