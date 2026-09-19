"use strict";
const assert = require('node:assert/strict');
global.RewardLab = require('./core.js');
global.LabContent = require('./content.js');
global.RhoCurves = require('./curves.js');
const V = require('./video.js');
const run = RewardLab.create({preset:'bell', seed:42});
for(let i=0;i<7;i++) RewardLab.step(run);
const before=JSON.stringify(run);
let labels=[], bars=[];
const context={fillText:s=>labels.push(s),fillRect:(...v)=>bars.push(v),beginPath(){},moveTo(){},lineTo(){},stroke(){},strokeRect(){},save(){},restore(){},scale(){},translate(){}};
const canvas={width:1920,height:1080,getContext:()=>context};
let state={run,methods:['ppo'],focus:'ppo',shown:7,horizon:100,pace:300,phase:'update',sounding:true,bin:5};
V.draw(canvas,state,{});
assert(labels.includes('Update 7 / 100'));
assert(labels.some(s=>s.startsWith('PPO sound')));
assert(labels.includes('4× playback · update'));
const ppoBars=bars.slice();
labels=[];bars=[];
state={...state,methods:['grpo'],focus:'grpo',shown:3,pace:1200,sounding:false};
V.draw(canvas,state,{});
assert(labels.includes('Update 3 / 100'));
assert(labels.includes('Sound off'));
assert(!labels.some(s=>s.startsWith('PPO sound')));
assert.notDeepEqual(bars,ppoBars);
assert.equal(JSON.stringify(run),before);
assert.equal(V.format({isTypeSupported:()=>false}),undefined);
assert.equal(V.format({isTypeSupported:x=>x.startsWith('video/webm')})[1],'webm');
console.log('PASS: live update position, selected policy, speed, sound state and chart data; recording does not mutate simulation.');

// Every selectable algorithm must render on full and partial chart pages.
for (let start=0; start<RewardLab.methods.length; start+=3) {
  const methods=RewardLab.methods.slice(start,start+3);
  for (const focus of methods) {
    labels=[]; bars=[];
    V.draw(canvas,{...state,methods,focus,sounding:true},{});
    for(const method of methods) assert(labels.includes(LabContent.names[method]));
    assert(labels.some(s=>s.startsWith(LabContent.names[focus]+' sound')));
    assert(bars.every(rect=>rect.every(Number.isFinite)));
  }
}
console.log('PASS: all ten algorithms, every focus, and partial chart-page exports.');

for(let count=1;count<=RewardLab.methods.length;count++) {
  const methods=RewardLab.methods.slice(0,count), size=V.dimensions(count);
  labels=[];
  V.draw({...canvas,...size},{...state,methods,focus:methods[0]},{});
  for(const method of methods) assert(labels.includes(LabContent.names[method]));
  assert(size.width<=1920 && size.height<=1920);
  assert(size.width%2===0 && size.height%2===0);
}
console.log('PASS: expanding video grids include every selected algorithm for 1–10 selections.');

for(const metric of Object.keys(RhoCurves.metrics)) {
  const plot=RhoCurves.data(run.history,RewardLab.methods,metric,3,100);
  assert.equal(plot.series.length,10);
  for(const series of plot.series) {
    assert.equal(series.points.length,4);
    assert.equal(series.points.at(-1).value,run.history[3].methods[series.id].metrics[metric]);
    assert(series.points.every(p=>p.value>=-1e-12 && p.value<=plot.max+1e-12));
  }
  assert(!RhoCurves.svg(plot,LabContent.names).includes('NaN'));
}
assert.equal(RhoCurves.data(run.history,['ppo'],'mean',0,25).series[0].points.length,1);
console.log('PASS: all six learning metrics, ten algorithms, replay truncation, and initial state.');
