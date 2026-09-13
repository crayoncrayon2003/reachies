import L from 'leaflet';
import { radialReach } from './travel.js';
import { reachColor } from './map-symbols.js';
// A single time field, not overlapping opaque station circles or a 500m cell mask.
export function radialReachLayer(stations,budget,through,mode='bike'){
  const Layer=L.GridLayer.extend({
    createTile(coords){
      const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
      const ctx=canvas.getContext('2d');
      const origin=L.point(coords.x*256,coords.y*256),step=2;
      for(let y=0;y<256;y+=step)for(let x=0;x<256;x+=step){
        const p=this._map.unproject(origin.add([x+step/2,y+step/2]),coords.z);
        const minutes=radialReach({lat:p.lat,lon:p.lng},stations,budget,through,mode);
        if(minutes===null)continue;
        ctx.fillStyle=reachColor(minutes);ctx.fillRect(x,y,step,step);
      }
      return canvas;
    },
  });
  return new Layer({pane:'reach',opacity:.62,tileSize:256,className:'radial-reach',keepBuffer:1,updateWhenIdle:true});
}
