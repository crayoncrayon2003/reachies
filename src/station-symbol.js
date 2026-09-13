export function stationSymbolSize(station){
  const routes=new Set();
  for(const member of station.members||[]){
    for(const route of member.routes||[member.route])if(route)routes.add(`${member.operator||''}\u0000${route}`);
  }
  return routes.size>1?20:14;
}
