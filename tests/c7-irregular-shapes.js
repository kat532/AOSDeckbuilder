// V5.3 C7 owner visual testing (11 Nov 2026): challenging but valid custom outlines used by
// tests/framing-c7.test.js and tests/e2e-v53-c7-framing.test.js, alongside tests/fixtures/owner-irregular-deck.json.
// Challenging but valid custom outlines (feet, house wall along z=0 unless noted).
const O=(pts,extra={})=>{const xs=pts.map(p=>p[0]),zs=pts.map(p=>p[1]);const x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs);
 return {shape:'free',width:+(x1-x0).toFixed(4),depth:+(z1-z0).toFixed(4),points:pts.map(([x,z])=>[(x-x0)/(x1-x0),(z-z0)/(z1-z0)]),height:4,houseEdges:[0],...extra};};
const t22=Math.tan(Math.PI/8); // 22.5 deg run per unit
module.exports=(owner)=>({
 'owner irregular deck (fixture)': owner,
 'flared 45° wings (narrow at house)': O([[4,0],[16,0],[20,4],[20,14],[0,14],[0,4]]),
 'flared 22.5° sides': O([[3,0],[17,0],[17+14*t22,14],[3-14*t22,14]]),
 'mixed 45° and 22.5° front corners': O([[0,0],[20,0],[20,8],[16,12],[4,14],[0,14-4/t22*0+0]].slice(0,5).concat([[0,14-10*t22]]) ),
 'chevron front (concave V)': O([[0,0],[20,0],[20,14],[10,10],[0,14]]),
 'bow front (pointed)': O([[0,0],[20,0],[20,10],[10,16],[0,10]]),
 'angled bay plus cut corners': O([[0,0],[24,0],[24,10],[20,14],[16,14],[13,17],[11,17],[8,14],[4,14],[0,10]]),
 'narrow angled arm': O([[0,0],[16,0],[16,8],[26,18],[22,22],[12,12],[0,12]]),
 'stepped notches with 45° returns': O([[0,0],[22,0],[22,6],[18,10],[18,14],[8,14],[8,10],[4,10],[0,6]]),
 'L with 45° inside corner': O([[0,0],[24,0],[24,18],[14,18],[14,12],[10,8],[0,8]]),
 'hexagon wide': O([[6,0],[18,0],[24,8],[18,16],[6,16],[0,8]]),
 'freestanding irregular 22.5°': O([[0,0],[16,0],[16+8*t22,8],[16,16],[0,16],[-8*t22,8]],{houseEdges:[],supportMode:'freestanding'}),
});
