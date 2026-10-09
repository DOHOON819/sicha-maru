export const MINUTE = 60_000;
export const CITIES = [
  ['Asia/Seoul','서울'],['Asia/Tokyo','도쿄'],['Asia/Shanghai','상하이'],['Asia/Hong_Kong','홍콩'],['Asia/Singapore','싱가포르'],['Asia/Bangkok','방콕'],['Asia/Jakarta','자카르타'],['Asia/Kolkata','뉴델리'],['Asia/Kathmandu','카트만두'],['Asia/Dubai','두바이'],
  ['Europe/London','런던'],['Europe/Paris','파리'],['Europe/Berlin','베를린'],['Europe/Helsinki','헬싱키'],['Europe/Istanbul','이스탄불'],['Africa/Johannesburg','요하네스버그'],['Africa/Cairo','카이로'],
  ['America/New_York','뉴욕'],['America/Chicago','시카고'],['America/Denver','덴버'],['America/Los_Angeles','로스앤젤레스'],['America/Vancouver','밴쿠버'],['America/Toronto','토론토'],['America/Mexico_City','멕시코시티'],['America/Sao_Paulo','상파울루'],['Pacific/Honolulu','호놀룰루'],
  ['Australia/Sydney','시드니'],['Australia/Adelaide','애들레이드'],['Australia/Perth','퍼스'],['Australia/Lord_Howe','로드하우섬'],['Pacific/Auckland','오클랜드'],['Pacific/Apia','아피아'],['UTC','UTC']
];
const formats = new Map();
export function parts(epoch, zone) {
  if (!Number.isFinite(epoch)) throw new Error('올바른 시각을 입력하세요.');
  if (!formats.has(zone)) formats.set(zone, new Intl.DateTimeFormat('en-GB', {timeZone:zone,calendar:'gregory',numberingSystem:'latn',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}));
  const p = {};
  for (const item of formats.get(zone).formatToParts(epoch)) if (item.type !== 'literal') p[item.type] = Number(item.value);
  p.weekday = new Date(Date.UTC(p.year,p.month-1,p.day)).getUTCDay();
  p.offset = (Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second) - Math.floor(epoch/1000)*1000) / MINUTE;
  return p;
}
const two = n => String(n).padStart(2,'0');
export const dateText = p => `${p.year}-${two(p.month)}-${two(p.day)}`;
export const timeText = p => `${two(p.hour)}:${two(p.minute)}`;
export const wallText = (epoch, zone) => { const p=parts(epoch,zone); return `${dateText(p)}T${timeText(p)}`; };
export function offsetText(offset) { return `UTC${offset<0?'−':'+'}${two(Math.floor(Math.abs(offset)/60))}:${two(Math.abs(offset)%60)}`; }
export function parseWall(text) {
  if (!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) throw new Error('2000~2099년의 날짜와 시간을 분 단위로 입력하세요.');
  const [year,month,day,hour,minute] = text.match(/\d+/g).map(Number);
  const epoch = Date.UTC(year,month-1,day,hour,minute);
  if (new Date(epoch).toISOString().slice(0,16) !== text) throw new Error('존재하는 날짜와 시간을 입력하세요.');
  return {year,month,day,hour,minute,epoch};
}
export function possibleInstants(text, zone) {
  if (!CITIES.some(([id])=>id===zone)) throw new Error('목록에서 기준 도시를 선택하세요.');
  const p = parseWall(text), result=[];
  // Every whole-minute offset in the curated modern zones is covered. Unlike
  // guessing a single offset, round-tripping detects skipped and repeated times.
  for (let offset=-14*60; offset<=14*60; offset++) {
    const epoch=p.epoch-offset*MINUTE, local=parts(epoch,zone);
    if (local.year===p.year && local.month===p.month && local.day===p.day && local.hour===p.hour && local.minute===p.minute && local.second===0) result.push(epoch);
  }
  return result.sort((a,b)=>a-b);
}
export function validateDuration(minutes) {
  if (!Number.isInteger(minutes) || minutes<15 || minutes>180) throw new Error('회의 길이는 15~180분으로 입력하세요.');
}
export function validateParticipants(people) {
  if (!Array.isArray(people) || people.length<1 || people.length>6) throw new Error('비교 도시는 1~6개로 선택하세요.');
  const seen = new Set();
  for (const person of people) {
    if (!CITIES.some(([id])=>id===person.zone) || seen.has(person.zone)) throw new Error('도시를 중복 없이 선택하세요.');
    seen.add(person.zone);
    if (!Number.isInteger(person.start) || !Number.isInteger(person.end) || person.start<0 || person.end>24 || person.start>=person.end) throw new Error('근무 시작은 종료보다 빨라야 합니다. 같은 날의 0~24시 범위를 사용하세요.');
  }
}
export function availability(epoch, duration, people, skipWeekends=true) {
  validateDuration(duration); validateParticipants(people);
  return people.map(person => {
    for (let minute=0; minute<duration; minute++) {
      const p=parts(epoch+minute*MINUTE,person.zone);
      if ((skipWeekends&&(p.weekday===0||p.weekday===6)) || p.hour<person.start || p.hour>=person.end) return false;
    }
    return true;
  });
}
export function findCommon(epoch, duration, people, skipWeekends=true) {
  validateDuration(duration); validateParticipants(people);
  const cache=new Map(), found=[];
  const fits = (at, person) => {
    const key=person.zone+':'+at;
    if (!cache.has(key)) {
      const p=parts(at,person.zone);
      cache.set(key,(!skipWeekends||p.weekday!==0&&p.weekday!==6)&&p.hour>=person.start&&p.hour<person.end);
    }
    return cache.get(key);
  };
  for (let step=0;step<48;step++) {
    const candidate=epoch+step*30*MINUTE;
    if (people.every(person=>{
      for(let minute=0;minute<duration;minute++) if(!fits(candidate+minute*MINUTE,person))return false;
      return true;
    })) found.push(candidate);
    if(found.length===6)break;
  }
  return found;
}
export function meetingSummary(epoch,duration,people,title='국제 회의') {
  validateDuration(duration); validateParticipants(people);
  const weekdays=['일','월','화','수','목','금','토'];
  return [title,`회의 길이: ${duration}분`,...people.map(person=>{
    const start=parts(epoch,person.zone), end=parts(epoch+duration*MINUTE,person.zone);
    const label=CITIES.find(([id])=>id===person.zone)[1];
    return `${label}: ${dateText(start)} (${weekdays[start.weekday]}) ${timeText(start)} ${offsetText(start.offset)} → ${dateText(end)} ${timeText(end)} ${offsetText(end.offset)} [${person.zone}]`;
  })].join('\n');
}
const escapeIcs = text => String(text).replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
function foldLine(text) {
  const encoder=new TextEncoder(); let line='', bytes=0, result=[];
  for(const c of text) {
    const length=encoder.encode(c).length;
    if(bytes+length>75){result.push(line);line=' ';bytes=1;}
    line+=c;bytes+=length;
  }
  result.push(line);return result.join('\r\n');
}
export function calendarFile({epoch,duration,title,description,uid,now=Date.now()}) {
  validateDuration(duration);
  if (!/^[A-Za-z0-9@._-]{1,150}$/.test(uid)) throw new Error('일정 식별자가 올바르지 않습니다.');
  const utc=ms=>new Date(ms).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Sicha Maru//Meeting Planner//KO','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:${uid}`,`DTSTAMP:${utc(now)}`,`DTSTART:${utc(epoch)}`,`DTEND:${utc(epoch+duration*MINUTE)}`,`SUMMARY:${escapeIcs(title||'국제 회의')}`,`DESCRIPTION:${escapeIcs(description||'')}`,'END:VEVENT','END:VCALENDAR'].map(foldLine).join('\r\n')+'\r\n';
}
