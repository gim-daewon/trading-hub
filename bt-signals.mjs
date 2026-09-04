// 신호 백테스트 — 판정은 앱 코드(buildBreakouts)를 그대로 쓴다.
// 지표는 롤링으로 한 번만 계산해 캐시한다 (구간마다 재계산하면 10분을 넘긴다).
import { buildBreakouts, BREAKOUTS, tierOf } from './lib/screener-shared.ts'

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
console.error(`유니버스 ${uni.length} · 수집 중...`)
const data=new Map(),queue=[...uni.map(x=>x.s),'SPY']
await Promise.all(Array.from({length:12},async()=>{while(queue.length){const s=queue.shift();const b=await bars(s);if(b)data.set(s,b)}}))
const spy=data.get('SPY'),stocks=[...data.entries()].filter(([s])=>s!=='SPY')
console.error(`수집 ${stocks.length}종목 · 지표 사전계산...`)

const roll=(c,v,n)=>{const a=new Array(c.length).fill(null);let pv=0,vv=0
  for(let i=0;i<c.length;i++){pv+=c[i]*v[i];vv+=v[i]
    if(i>=n){pv-=c[i-n]*v[i-n];vv-=v[i-n]}
    if(i>=n-1&&vv>0)a[i]=pv/vv}return a}
// 부호 있는 연속 카운트 — 앱 aboveVwmaRun과 같은 논리
const signedRun=(c,ma)=>{const a=new Array(c.length).fill(null);let r=0
  for(let i=0;i<c.length;i++){if(ma[i]==null){a[i]=null;continue}
    const ab=c[i]>ma[i]; r=ab?(r>0?r+1:1):(r<0?r-1:-1); a[i]=r}return a}
const flowAt=(c,v,i,n)=>{let u=0,d=0;for(let k=i-n+1;k<=i;k++){if(k<=0)continue
  const dv=c[k]*v[k];if(c[k]>c[k-1])u+=dv;else if(c[k]<c[k-1])d+=dv}
  return (u+d)===0?null:((u-d)/(u+d))*100}

const IND=new Map()
for(const [sym,b] of stocks){
  const d20=roll(b.c,b.v,20),d60=roll(b.c,b.v,60)
  // 주봉 파생 + 각 일봉이 참조할 '마지막 완료 주' 인덱스
  const wc=[],wv=[],lastDone=[];let cur=null
  for(let i=0;i<b.t.length;i++){
    const dt=new Date(b.t[i]*1000)
    const u=new Date(Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth(),dt.getUTCDate()))
    u.setUTCDate(u.getUTCDate()+4-(u.getUTCDay()||7))
    const key=u.getUTCFullYear()*100+Math.ceil(((u-Date.UTC(u.getUTCFullYear(),0,1))/86400000+1)/7)
    if(key!==cur){wc.push(b.c[i]);wv.push(b.v[i]);cur=key}else{wc[wc.length-1]=b.c[i];wv[wv.length-1]+=b.v[i]}
    lastDone.push(wc.length-2)}   // 진행 중인 주를 빼고 그 앞
  const w20=roll(wc,wv,20),w60=roll(wc,wv,60)
  IND.set(sym,{d20,d60,dRun:signedRun(b.c,d20),wc,w20,w60,wRun:signedRun(wc,w20),lastDone,
    idx:new Map(b.t.map((x,i)=>[x,i]))})}
console.error('완료\n')

const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0
const med=a=>{const s=[...a].sort((x,y)=>x-y),h=s.length>>1;return s.length?(s.length%2?s[h]:(s[h-1]+s[h])/2):0}
const KEYS=BREAKOUTS.map(b=>b.key)
const AGG={base:[]};for(const k of KEYS)AGG[k]=[]

for(let start=200;start<210;start++){
  const P={base:[]};for(const k of KEYS)P[k]=[]
  for(let i=start;i+FWD<spy.t.length;i+=STEP){
    const ts=spy.t[i],tsF=spy.t[i+FWD]
    const spyRet=((spy.c[i+FWD]-spy.c[i])/spy.c[i])*100
    const rows=[],ex=new Map()
    for(const [sym,b] of stocks){
      const I=IND.get(sym)
      const j=I.idx.get(ts),jF=I.idx.get(tsF)
      if(j===undefined||jF===undefined||j<330)continue
      const wi=I.lastDone[j]; if(wi<60)continue
      rows.push({symbol:sym,name:'',sector:'',marketCap:5e10,tier:tierOf(5e10),
        f5:null,f20:flowAt(b.c,b.v,j,20),f60:null,rvol:null,
        chg20:((b.c[j]-b.c[j-20])/b.c[j-20])*100,pctB:null,
        vwma20:I.d20[j],vwma60:I.d60[j],aboveRun:I.dRun[j],
        wClose:I.wc[wi],wVwma20:I.w20[wi],wVwma60:I.w60[wi],wAboveRun:I.wRun[wi],
        price:b.c[j]})
      ex.set(sym,((b.c[jF]-b.c[j])/b.c[j])*100-spyRet)}
    if(rows.length<200)continue
    P.base.push(mean(rows.map(r=>ex.get(r.symbol))))
    const out=buildBreakouts(rows,99999)
    for(const k of KEYS){const g=out.large[k];if(g.length)P[k].push(mean(g.map(r=>ex.get(r.symbol))))}}
  for(const k of ['base',...KEYS]){const a=P[k];if(!a.length)continue
    AGG[k].push({pos:a.filter(v=>v>0).length/a.length*100,med:med(a),n:a.length})}}

const sg=v=>(v>=0?'+':'')+v.toFixed(2),pad=(s,n)=>String(s).padEnd(n)
console.log('격자 시작점 10개 — 앱 판정 함수(buildBreakouts) 사용')
console.log(pad('신호',22),pad('양수비율',20),'중앙값')
console.log('-'.repeat(64))
for(const k of ['base',...KEYS]){
  const a=AGG[k];if(!a.length){console.log(pad(k,22),'표본없음');continue}
  const ps=a.map(x=>x.pos),ms=a.map(x=>x.med)
  const label=k==='base'?'기준선(전체)':BREAKOUTS.find(b=>b.key===k).label
  console.log(pad(label,22),
    pad(`${med(ps).toFixed(0)}%  (${Math.min(...ps).toFixed(0)}~${Math.max(...ps).toFixed(0)})`,20),
    `${sg(med(ms))}%p`)}
