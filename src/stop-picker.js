// Keep the native select small while allowing every station and stop to be searched.
export function searchablePicker(select,nodes,label){
  const search=document.createElement('input');search.type='search';search.placeholder='名称で検索';search.setAttribute('aria-label',`${label}を検索`);
  select.before(search);
  const caption=document.createElement('small');caption.className='hint';select.after(caption);
  const optionFor=node=>{const option=document.createElement('option');option.value=node.key;option.textContent=`${node.name}${node.type==='bus_stop'?`（バス・${node.operators?.[0]||''}）`:''}`;return option;};
  const ordered=[...nodes].sort((a,b)=>Number(!b.sourceId.startsWith('rail-')&&!b.sourceId.startsWith('bus-'))-Number(!a.sourceId.startsWith('rail-')&&!a.sourceId.startsWith('bus-')));
  function populate(){
    const value=select.value,q=search.value.trim();
    const matches=ordered.filter(n=>!q||[n.name,...(n.names||[]),...(n.operators||[])].some(v=>v.includes(q)));
    select.replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent='地点を選択';select.append(empty);
    for(const node of matches.slice(0,150))select.append(optionFor(node));
    if(value)setValue(value);
    caption.textContent=q?(matches.length>150?`150 / ${matches.length}件`:`${matches.length}件`):'';
    caption.hidden=!q;
  }
  function setValue(value){
    if(value&&![...select.options].some(o=>o.value===value)){const node=nodes.find(n=>n.key===value);if(node)select.append(optionFor(node));}
    select.value=value||'';
  }
  search.oninput=populate;populate();
  return {setValue};
}
