"""Index authentic renderer/browser captures and their provenance for review."""
from pathlib import Path
import json
from PIL import Image
root=Path(__file__).resolve().parents[2]
docs=root/'Docs/ui-ux';out=docs/'client-demo';out.mkdir(exist_ok=True)
roles={'customer':'Flutter production widgets; isolated scenario/service fixtures; captured checkout uses explicitly simulated online/COD capability','vendor':'Flutter production widgets; isolated scenario/API/order fixtures; legacy login component is not a hosted Clerk login','delivery':'Flutter production widgets; sourced map pins and simulated GPS/API fixtures','admin':'Actual Chromium; explicitly labelled synthetic API fixtures, not a hosted session'}
rows=[]
for phase in ['before','after']:
 for role,source in roles.items():
  for p in sorted((docs/phase/role).glob('*.png')):
   im=Image.open(p)
   rows.append({'path':str(p.relative_to(docs)),'role':role,'phase':phase,'width':im.width,'height':im.height,'source':source if phase=='after' else 'Historical baseline; see existing UI audit','physicalDevice':False,'livePayments':False,'productImages':'Original AI-generated, unbranded demo illustrations' if phase=='after' else 'Baseline assets/fallbacks'})
(docs/'screenshot-manifest.json').write_text(json.dumps(rows,indent=2)+'\n')
sections=[]
for role,source in roles.items():
 images=[r for r in rows if r['role']==role and r['phase']=='after' and r['width'] in [390,1280,1440]]
 sections.append(f'<section id="{role}"><h2>{role.title()}</h2><p>{source}.</p><div class="grid">'+''.join(f'<figure><a href="../{r["path"]}"><img loading="lazy" src="../{r["path"]}" alt="Implemented {role} {Path(r["path"]).stem} screen"></a><figcaption>{Path(r["path"]).stem.replace("-"," ")} · {r["width"]}×{r["height"]}</figcaption></figure>' for r in images)+'</div></section>')
html='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Grozo client demo · final polish</title><style>body{margin:0;background:#f6f8f6;color:#14201a;font:16px/1.5 system-ui}header,main{max-width:1440px;margin:auto;padding:24px}h1,a{color:#005a26}nav{display:flex;gap:24px;flex-wrap:wrap}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}figure{margin:0;padding:16px;background:white;border:1px solid #dde5df;border-radius:16px}img{width:100%;height:560px;object-fit:contain;object-position:top}figcaption{margin-top:12px;font-weight:600}section{margin-bottom:48px}@media print{nav{display:none}section{break-before:page}.grid{grid-template-columns:repeat(3,1fr)}img{height:400px}}</style><header><h1>Grozo · implemented client demo</h1><p>Includes the 26 October 2026 readiness captures and historical comparison captures. Actual application widgets/browser UI; fixture-based captures, not physical devices. Stores/accounts are explicitly synthetic. Product illustrations are original AI-generated unbranded assets. Flutter captures use controlled service fixtures; admin captures use explicit synthetic browser fixtures. No hosted service, physical-device, live payment or street-routing claim.</p><nav><a href="#customer">Customer</a><a href="#vendor">Vendor</a><a href="#delivery">Delivery</a><a href="#admin">Admin</a><a href="Grozo-before-after.pdf">Before / after PDF</a><a href="README.md">Demo guide</a><a href="../../demo/product-image-licenses.md">Image rights</a></nav></header><main>'''+''.join(sections)+'</main></html>'
(out/'index.html').write_text(html)
print('Indexed',len(rows),'actual captures.')
