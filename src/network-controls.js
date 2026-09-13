// Route switches retain their state while the list is searched.
export function createRouteControls(container,master,entries,onChange){
  const enabled=new Set(entries.map(entry=>entry.id));
  const search=document.createElement('input');search.type='search';search.placeholder='路線・事業者を検索';search.setAttribute('aria-label',`${master.getAttribute('aria-label')}を検索`);
  const list=document.createElement('div');list.className='network-list';container.append(search,list);
  const boxes=[];
  for(const entry of entries){
    const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.checked=true;box.dataset.routeId=entry.id;
    label.append(box,document.createTextNode(entry.name));label.title=entry.operator||entry.name;list.append(label);boxes.push({box,label,entry});
    box.onchange=()=>{if(box.checked)enabled.add(entry.id);else enabled.delete(entry.id);sync();onChange(enabled);};
  }
  function sync(){master.checked=entries.length>0&&enabled.size===entries.length;master.indeterminate=enabled.size>0&&enabled.size<entries.length;}
  master.onchange=()=>{const checked=master.checked;enabled.clear();for(const {box,entry} of boxes){box.checked=checked;if(checked)enabled.add(entry.id);}sync();onChange(enabled);};
  search.oninput=()=>{const q=search.value.trim().toLowerCase();for(const {label,entry} of boxes)label.hidden=!`${entry.name} ${entry.operator||''}`.toLowerCase().includes(q);};
  sync();return enabled;
}
