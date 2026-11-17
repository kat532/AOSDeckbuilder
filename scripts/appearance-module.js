(function(global){
// AOSAppearance: maps saved catalog product IDs to approximate presentation colors.
// Presentation only: it never changes geometry, counts or saved data. With no catalog product
// selected every function returns null, so the engine keeps its concept palette colors.
'use strict';
function create(cat){
 const deckColor=new Map(),deckLine=new Map(),deckBrand=new Map(),looks=new Map();
 for(const b of cat?.decking||[])for(const l of b.lines){deckLine.set(l.id,l);deckBrand.set(l.id,b);for(const c of l.colors){deckColor.set(c.id,{...c,lineId:l.id,brandId:b.id});looks.set(c.look.hex.toLowerCase(),c.look);}}
 const finishes=new Map(),systems=new Map(),railBrand=new Map();
 for(const b of cat?.railing||[]){railBrand.set(b.id,b);for(const [id,f] of Object.entries(b.finishes))finishes.set(id,{...f,id,brandId:b.id});for(const s of b.systems)systems.set(s.id,{...s,brandId:b.id});}
 const hexOf=id=>deckColor.get(id)?.look.hex||null;
 // A decking selection is complete only when brand, collection and color agree with the catalog.
 function deckPick(q){const p=q&&q.catalogDecking;if(!p||typeof p!=='object')return null;const c=deckColor.get(p.colorId);
  if(!c||c.lineId!==p.lineId||c.brandId!==p.brandId)return null;return p;}
 // Same-collection color, else the main color (compatible contrast only within the selected collection).
 function roleColor(p,id){const c=id&&deckColor.get(id);return c&&c.lineId===p.lineId?c.look.hex:hexOf(p.colorId);}
 function deck(q,role,stair){const p=deckPick(q);if(!p)return null;
  const frame=roleColor(p,p.frameColorId),main=hexOf(p.colorId),st=stair&&p.stairs&&p.stairs[stair.id]||{};
  switch(role){
   case 'field':return main;
   case 'frame':case 'landing-frame':return frame;
   case 'divider':return roleColor(p,p.dividerColorId);
   case 'fascia':case 'landing-fascia':case 'skirt':return roleColor(p,p.fasciaColorId);
   case 'landing':return roleColor(p,p.landingColorId);
   case 'tread':return st.tread==='frame'?frame:main;
   case 'riser':return st.riser==='frame'?frame:main;
   default:return null;}}
 // Railing: stair override, else its edge override, else the deck-wide product (catalog finish color).
 function railPick(q,ref){const r=q&&q.catalogRailing;if(!r||typeof r!=='object')return null;
  const s=ref&&ref.stair,own=s&&r.stairs&&r.stairs[s.id];const edge=s?s.edge:ref&&ref.edge;
  return own||(Number.isInteger(edge)&&r.edges&&r.edges[edge])||r;}
 function rail(q,ref){const p=railPick(q,ref);const f=p&&finishes.get(p.finishId);return f?f.look.hex:null;}
 // Subtle deterministic board-to-board variation for decking (3D only). Keyed by board position so
 // it does not flicker; amplitude from the research dataset (low/medium/high variegation).
 const WOOD=/^(field-board|picture-frame|divider-board|landing-board|landing-frame|stair-tread)$/;
 function hex2(h){return [1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);}
 function to2(c){return '#'+c.map(v=>Math.round(Math.max(0,Math.min(1,v))*255).toString(16).padStart(2,'0')).join('');}
 function shade(part){const look=part&&looks.get(String(part.color).toLowerCase());if(!look||!WOOD.test(part.kind))return null;
  let h=Math.abs(Math.round(part.x*37)*73856093^Math.round(part.z*37)*19349663^Math.round(part.y*101)*83492791)%1000/1000;
  const amp=Math.min(.07,(look.var||0.02)*1.4),t=(h-.5)*2*amp;let c=hex2(look.hex);
  c=c.map(v=>v*(1+t));
  if(look.streak&&h>.88){const s=hex2(look.streak);c=c.map((v,i)=>v*.78+s[i]*.22);}
  return to2(c);}
 return {deck,rail,shade,deckPick,railPick,deckColor:id=>deckColor.get(id)||null,line:id=>deckLine.get(id)||null,brandOfLine:id=>deckBrand.get(id)||null,
  finish:id=>finishes.get(id)||null,system:id=>systems.get(id)||null,railBrand:id=>railBrand.get(id)||null};
}
global.AOSAppearance={create};
})(window);
