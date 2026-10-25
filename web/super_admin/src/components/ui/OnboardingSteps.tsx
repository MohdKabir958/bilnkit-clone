import {useEffect,useRef} from 'react';

/** Shared, keyboard-readable progress without allowing validation to be skipped. */
export function OnboardingSteps({steps,step,onBack}:{steps:string[];step:number;onBack:(step:number)=>void}) {
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{heading.current?.focus();heading.current?.scrollIntoView?.({block:'nearest'});},[step]);
  return <div className="space-y-4">
    <ol aria-label="Onboarding progress" className="grid grid-cols-4 gap-2">{steps.map((label,index)=><li key={label} aria-current={index===step?'step':undefined} className="min-w-0">
      <button type="button" disabled={index>=step} onClick={()=>onBack(index)} className={`w-full rounded-k-sm px-1 py-2 text-xs font-semibold ${index===step?'bg-kraveo-g50 text-kraveo-g800':'bg-kraveo-surface2 text-kraveo-ink2'}`}><span className="block">{index<step?'✓':index+1}</span><span className="mt-1 block break-words">{label}</span></button>
    </li>)}</ol>
    <h3 ref={heading} tabIndex={-1} className="text-lg font-bold outline-none">Step {step+1} of {steps.length}: {steps[step]}</h3>
  </div>;
}
