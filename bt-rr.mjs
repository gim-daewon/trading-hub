// 바닥잡기의 손익비 분석.
//
// 가설(사용자): 역배열에서 VWMA60과 VWMA20이 넓게 벌어져 있을 때
// VWMA20을 돌파하면 VWMA60까지 상방 여력이 크므로 손익비가 좋다.
//
// 지금까지 승률만 봤고 손익비는 안 봤다. 셋을 나눠 측정한다:
//   1) 상방 여력  = (VWMA60 - 진입가) / 진입가
//   2) 도달률     = 20일 안에 종가가 VWMA60에 닿았나
//   3) MFE/MAE   = 진입 후 최대 상승 / 최대 하락 (종가 기준)
// 진입 조건은 앱의 buildBreakouts를 그대로 쓴다 (검증과 화면이 갈라지지 않게).
import { buildBreakouts, tierOf } from './lib/screener-shared.ts'

const NH={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0','Accept':'application/json','Origin':'https://www.nasdaq.com','Referer':'https://www.nasdaq.com/'}
const YH={'User-Agent':'Mozilla/5.0'}
const num=s=>parseFloat(String(s).replace(/[$,%]/g,''))||0
const FWD=20,STEP=20

const r0=await fetch('https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=25&offset=0&download=true',{headers:NH})
const uni=(await r0.json()).data.rows.map(x=>({s:x.symbol,mc:num(x.marketCap),dv:num(x.lastsale)*num(x.volume)}))
  .filter(x=>/^[A-Z]{1,5}$/.test(x.s)&&x.dv>=5e6&&x.mc>=5e8)
async function bars(s){try{
  const r=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${s}?interval=1d&range=10y`,{headers:YH})
  if(!r.ok)return null;const res=(await r.json()).chart?.result?.[0];if(!res)return null
  const q=res.indicators.quote[0],t=[],c=[],v=[]
  for(let i=0;i<(res.timestamp||[]).length;i++){if(q.close[i]==null||q.volume[i]==null)continue
    t.push(res.timestamp[i]);c.push(q.close[i]);v.push(q.volume[i])}
  return t.length>=600?{t,c,v}:null}catch{return null}}
console.error(`유니버스 ${uni.length} 수집...`)
const data=new Map(),queue=[...uni.map(x=>x.s),'SPY']
await Promise.all(Array.from({length:12},async()=>{while(queue.length){const s=queue.shift();const b=await bars(s);if(b)data.set(s,b)}}))
const spy=data.get('SPY'),stocks=[...data.entries()].filter(([s])=>s!=='SPY')
console.error(`수집 ${stocks.length} · 사전계산...`)

const roll=(c,v,n)=>{const a=new Array(c.length).fill(null);let pv=0,vv=0
  for(let i=0;i<c.length;i++){pv+=c[i]*v[i];vv+=v[i]
    if(i>=n){pv-=c[i-n]*v[i-n];vv-=v[i-n]}
    if(i>=n-1&&vv>0)a[i]=pv/vv}return a}
const runs=(c,ma)=>{const R=new Array(c.length).fill(0),P=new Array(c.length).fill(0)
  let r=0,p=0
  for(let i=0;i<c.length;i++){if(ma[i]==null){R[i]=0;P[i]=0;continue}
    const ab=c[i]>ma[i], same=ab?r>0:r<0
    if(same)r=ab?r+1:r-1; else {p=Math.abs(r); r=ab?1:-1}
    R[i]=r;P[i]=p}return {R,P}}
const flowAt=(c,v,i,n)=>{let u=0,d=0;for(let k=i-n+1;k<=i;k++){if(k<=0)continue
  const dv=c[k]*v[k];if(c[k]>c[k-1])u+=dv;else if(c[k]<c[k-1])d+=dv}
  return (u+d)===0?null:((u-d)/(u+d))*100}

const IND=new Map()
for(const [sym,b] of stocks){
  const d20=roll(b.c,b.v,20),d60=roll(b.c,b.v,60)
  const {R,P}=runs(b.c,d20)
  IND.set(sym,{d20,d60,R,P,idx:new Map(b.t.map((x,i)=>[x,i]))})}
console.error('완료\n')

const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0
const med=a=>{const s=[...a].sort((x,y)=>x-y),h=s.length>>1;return s.length?(s.length%2?s[h]:(s[h-1]+s[h])/2):0}

// 벌어진 폭(spread)별로 나눈다
const B=[['0~3%',0,3],['3~6%',3,6],['6~10%',6,10],['10~15%',10,15],['15%+',15,999]]
const R={}; for(const [n] of B) R[n]=[]

for(let start=200;start<210;start++){
 for(let i=start;i+FWD<spy.t.length;i+=STEP){
  const ts=spy.t[i],tsF=spy.t[i+FWD]
  const spyRet=((spy.c[i+FWD]-spy.c[i])/spy.c[i])*100
  const rows=[],meta=new Map()
  for(const [sym,b] of stocks){
    const I=IND.get(sym); const j=I.idx.get(ts)
    if(j===undefined||j<330||I.idx.get(tsF)===undefined)continue
    rows.push({symbol:sym,name:'',sector:'',marketCap:5e10,tier:tierOf(5e10),
      f5:null,f20:flowAt(b.c,b.v,j,20),f60:null,rvol:null,
      chg20:((b.c[j]-b.c[j-20])/b.c[j-20])*100,pctB:null,
      vwma20:I.d20[j],vwma60:I.d60[j],aboveRun:I.R[j],prevRun:I.P[j],
      wClose:null,wVwma20:null,wVwma60:null,wAboveRun:null,wPrevRun:null,
      price:b.c[j]})
    meta.set(sym,{b,j})}
  if(rows.length<200)continue
  const hits=buildBreakouts(rows,99999).large.revD
  for(const r of hits){
    const {b,j}=meta.get(r.symbol)
    const entry=r.price, tgt=r.vwma60
    const spread=((tgt-entry)/entry)*100          // 상방 여력
    let mfe=0,mae=0,hit=false,hitDay=null
    for(let k=1;k<=FWD;k++){
      const px=b.c[j+k]; if(px==null)break
      const ret=((px-entry)/entry)*100
      if(ret>mfe)mfe=ret
      if(ret<mae)mae=ret
      if(!hit&&px>=tgt){hit=true;hitDay=k}}
    const fwd=((b.c[j+FWD]-entry)/entry)*100
    for(const [n,lo,hi] of B) if(spread>=lo&&spread<hi){
      R[n].push({spread,mfe,mae,hit,hitDay,fwd,ex:fwd-spyRet});break}}}}

const sg=v=>(v>=0?'+':'')+v.toFixed(2),pad=(s,n)=>String(s).padEnd(n)
console.log('바닥잡기 일봉 — 60일선까지의 여력(spread)별 손익비')
console.log(pad('여력',9),pad('표본',7),pad('평균여력',9),pad('도달률',8),pad('평균MFE',9),pad('평균MAE',9),pad('손익비',7),pad('20일수익',9),'SPY대비')
console.log('-'.repeat(92))
for(const [n] of B){
  const a=R[n]; if(a.length<30){console.log(pad(n,9),`표본 ${a.length} (부족)`);continue}
  const mfe=mean(a.map(x=>x.mfe)),mae=mean(a.map(x=>x.mae))
  console.log(pad(n,9),pad(a.length,7),
    pad(sg(mean(a.map(x=>x.spread)))+'%',9),
    pad((a.filter(x=>x.hit).length/a.length*100).toFixed(0)+'%',8),
    pad(sg(mfe)+'%',9),pad(sg(mae)+'%',9),
    pad((mfe/Math.abs(mae)).toFixed(2),7),
    pad(sg(med(a.map(x=>x.fwd)))+'%',9),
    sg(med(a.map(x=>x.ex)))+'%p')}
console.log('\n※ MFE=진입 후 최대상승 · MAE=최대하락 (종가 기준, 20일 내)')
console.log('※ 손익비 = 평균MFE / |평균MAE|. 1보다 크면 상방이 하방보다 크다')
console.log('※ 20일수익·SPY대비는 중앙값')
