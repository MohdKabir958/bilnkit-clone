import '@fontsource-variable/bricolage-grotesque/index.css';
import '@fontsource-variable/plus-jakarta-sans/index.css';
import './pilot.css';
import brand from '../../../branding/brand.json';
document.querySelectorAll('[data-brand]').forEach(node => {
  const logo = document.createElement('img');
  logo.src = '/brand/grozo-logo.png';
  logo.alt = brand.name;
  logo.className = 'brand-logo';
  logo.width = 160;
  logo.height = 80;
  node.replaceChildren(logo);
});
document.documentElement.style.setProperty('--brand',brand.primary);
document.documentElement.style.setProperty('--accent',brand.accent);
document.title=`${document.querySelector('h1')?.textContent ?? 'Local grocery marketplace'} | ${brand.name}`;

document.querySelectorAll('[data-tagline]').forEach(node => { node.textContent = brand.tagline; });
