import '@fontsource-variable/bricolage-grotesque/index.css';
import '@fontsource-variable/plus-jakarta-sans/index.css';
import './pilot.css';
import brand from '../../../branding/brand.json';
document.querySelectorAll('[data-brand]').forEach(node => {node.textContent=brand.name;});
document.documentElement.style.setProperty('--brand',brand.primary);
document.documentElement.style.setProperty('--accent',brand.accent);
document.title=`${document.querySelector('h1')?.textContent ?? 'Local grocery marketplace'} | ${brand.name}`;
