// Keep historical card forms when a deck is opened in the position-based builder.
export const normalizedForm=f=>({normal:'n',norm:'n',champ:'n',evo:'e',evolved:'e',hero:'h',n:'n',e:'e',h:'h'})[f]||'?';
export function buildDeckUrl(deck,forms){
 const names=(deck||[]).slice(0,8);const p=new URLSearchParams({deck:names.join(','),f:names.map((_,i)=>normalizedForm(forms?.[i])).join(''),from:'player'});
 return 'index.html?'+p;
}
export function arrangeImportedDeck(names,forms,cards){
 const selected=names.map((n,i)=>({card:cards.find(c=>c.name===n),form:normalizedForm(forms?.[i])})).filter(x=>x.card);
 const unique=selected.filter((x,i)=>selected.findIndex(y=>y.card.name===x.card.name)===i).slice(0,8);
 const deck=Array(8).fill(null),wild={};
 function accepts({card,form},slot){
  if(form==='?')return true;
  if(slot===0)return form===(card.evolved?'e':'n');
  if(slot===1)return form===(card.hero?'h':'n');
  if(slot===2)return form==='n'?!card.evolved&&!card.hero:form==='e'?!!card.evolved:!!card.hero;
  return form==='n';
 }
 const order=unique.slice().sort((a,b)=>(a.form==='n'?1:0)-(b.form==='n'?1:0));
 function place(i){if(i===order.length)return true;const x=order[i];const slots=x.form==='n'?[3,4,5,6,7,0,1,2]:[0,1,2,3,4,5,6,7];
  for(const slot of slots)if(!deck[slot]&&accepts(x,slot)){deck[slot]=x.card;if(place(i+1))return true;deck[slot]=null;}return false;
 }
 const exact=place(0);if(!exact){deck.fill(null);unique.forEach((x,i)=>deck[i]=x.card);}
 if(deck[2]){const f=unique.find(x=>x.card===deck[2])?.form;if(f==='e'||f==='h')wild[deck[2].name]=f==='h'?'hero':'evolved';}
 return {deck,wild,exact,known:unique.every(x=>x.form!=='?')};
}
