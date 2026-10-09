import {CITIES,MINUTE,parts,dateText,timeText,wallText,offsetText,possibleInstants,availability,findCommon,meetingSummary,calendarFile,validateParticipants} from './core.js';
const $=id=>document.getElementById(id), label=zone=>CITIES.find(([id])=>id===zone)[1];
let current=null;
const weekdays=['일','월','화','수','목','금','토'];
function element(tag,text,className) { const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e; }
function option(value,text){const e=element('option',text);e.value=value;return e;}
for(const [id,name] of CITIES)$('base').append(option(id,name+' · '+id));
$('base').value='Asia/Seoul';
function readPeople(){return [...$('participants').children].map(row=>({zone:row.dataset.zone,start:Number(row.querySelector('.start').value),end:Number(row.querySelector('.end').value)}));}
function invalidate(message='설정이 바뀌었습니다. 다시 비교해주세요.') {
  current=null;$('results').hidden=true;$('error').hidden=true;$('ambiguity').hidden=true;$('copy-fallback').hidden=true;
  $('suggestions').replaceChildren();$('status').textContent=message;
}
function renderPeople(people){
  $('participants').replaceChildren(...people.map(person=>{
    const row=element('div',undefined,'person');row.dataset.zone=person.zone;
    const city=element('div');city.append(element('span',label(person.zone),'city-name'),element('span',person.zone,'city-zone'));
    const range=element('div',undefined,'work-range');
    for(const [kind,caption,min,max,value] of [['start','근무 시작',0,23,person.start],['end','근무 종료',1,24,person.end]]){
      const field=element('label',caption), select=element('select',undefined,kind);select.setAttribute('aria-label',label(person.zone)+' '+caption);
      for(let h=min;h<=max;h++)select.append(option(h,String(h).padStart(2,'0')+':00'));
      select.value=String(value);field.append(select);range.append(field);
    }
    const remove=element('button','×','remove');remove.type='button';remove.setAttribute('aria-label',label(person.zone)+' 제외');remove.disabled=people.length===1;
    remove.addEventListener('click',()=>{const next=readPeople().filter(p=>p.zone!==person.zone);renderPeople(next);invalidate();});
    row.append(city,range,remove);return row;
  }));
  $('city-count').textContent=people.length+' / 6';$('add').disabled=people.length===6;
  $('add-zone').replaceChildren(...CITIES.filter(([id])=>!people.some(p=>p.zone===id)).map(([id,name])=>option(id,name)));
}
renderPeople([{zone:'Asia/Seoul',start:9,end:18},{zone:'Europe/London',start:9,end:18},{zone:'America/New_York',start:9,end:18}]);
$('add').addEventListener('click',()=>{const people=readPeople();if(people.length<6){people.push({zone:$('add-zone').value,start:9,end:18});renderPeople(people);invalidate();}});
$('plan-form').addEventListener('input',event=>{if(event.target.id!=='add-zone')invalidate();});
function setWall(epoch){const wall=wallText(epoch,$('base').value);$('date').value=wall.slice(0,10);$('time').value=wall.slice(11);}
function now(){setWall(Math.floor(Date.now()/MINUTE)*MINUTE);invalidate('기준 도시의 현재 시각을 넣었습니다. 비교 버튼을 눌러주세요.');}
$('now').addEventListener('click',now);now();
function error(message){invalidate('결과를 표시하지 않았습니다. 입력을 확인해주세요.');$('error').textContent=message;$('error').hidden=false;}
function render(epoch,people,duration,skipWeekends){
  const fit=availability(epoch,duration,people,skipWeekends),base=parts(epoch,$('base').value);
  current={epoch,people:people.map(p=>({...p})),duration,skipWeekends,base:$('base').value};
  $('ambiguity').hidden=true;$('error').hidden=true;$('results').hidden=false;$('suggestions').replaceChildren();
  $('fit-count').textContent=`${fit.filter(Boolean).length} / ${people.length}개 도시 근무시간`;
  $('status').textContent=`비교 완료 · ${label(current.base)} ${dateText(base)} ${timeText(base)} ${offsetText(base.offset)} · 실제 ${duration}분`;
  $('cards').replaceChildren(...people.map((person,index)=>{
    const start=parts(epoch,person.zone),end=parts(epoch+duration*MINUTE,person.zone),card=element('article',undefined,'card');
    const top=element('div',undefined,'card-top');top.append(element('h3',label(person.zone)),element('span',fit[index]?'근무시간 안':'근무시간 밖','badge '+(fit[index]?'good':'out')));
    const time=element('p',timeText(start),'local-time');time.append(element('span',offsetText(start.offset),'offset'));
    const diff=Math.round((Date.UTC(start.year,start.month-1,start.day)-Date.UTC(base.year,base.month-1,base.day))/86400000);
    const dayLabel=diff===0?'기준 도시와 같은 날짜':`기준 도시보다 ${Math.abs(diff)}일 ${diff<0?'전':'후'}`;
    const hours=element('div',undefined,'hours');hours.setAttribute('aria-hidden','true');
    const workday=!skipWeekends||(start.weekday!==0&&start.weekday!==6);
    for(let h=0;h<24;h++)hours.append(element('span',undefined,(workday&&h>=person.start&&h<person.end?'work ':'')+(h===start.hour?'active':'')));
    const scale=element('div',undefined,'hour-labels');scale.setAttribute('aria-hidden','true');for(const t of ['00','06','12','18','24'])scale.append(element('span',t));
    card.append(top,element('p',`${dateText(start)} (${weekdays[start.weekday]})`,'local-date'),time,element('p',`종료 ${dateText(end)} ${timeText(end)} ${offsetText(end.offset)}`,'end-time'),element('p',dayLabel+(start.offset!==end.offset?' · 회의 중 시차 변경':''),'day-diff'),hours,scale);
    return card;
  }));
}
function calculate(){
  invalidate();
  try {
    const people=readPeople();validateParticipants(people);
    const wall=$('date').value+'T'+$('time').value,duration=Number($('duration').value),skip=$('weekends').checked;
    const candidates=possibleInstants(wall,$('base').value);
    if(!candidates.length)throw new Error('이 도시에서는 시계 변경으로 해당 시각이 존재하지 않습니다. 다른 시작 시각을 선택해주세요.');
    if(candidates.length>1){
      $('ambiguity').hidden=false;$('status').textContent='중복된 시각 중 하나를 선택하면 결과를 표시합니다.';
      $('ambiguity-options').replaceChildren(...candidates.map((epoch,index)=>{
        const button=element('button',`${index===0?'첫 번째':'두 번째'} ${timeText(parts(epoch,$('base').value))} · ${offsetText(parts(epoch,$('base').value).offset)}`,'secondary');button.type='button';button.addEventListener('click',()=>render(epoch,people,duration,skip));return button;
      }));return;
    }
    render(candidates[0],people,duration,skip);
  }catch(e){error(e.message);}
}
$('plan-form').addEventListener('submit',event=>{event.preventDefault();calculate();});
$('find').addEventListener('click',()=>{
  if(!current)return;
  const {epoch,people,duration,skipWeekends,base}=current;
  const candidates=findCommon(epoch,duration,people,skipWeekends).filter(at=>wallText(at,base).startsWith('20'));
  $('suggestions').replaceChildren();
  if(!candidates.length){$('suggestions').append(element('p','다음 24시간의 30분 간격 후보에는 공통 근무시간이 없습니다. 날짜·회의 길이·근무시간을 조정해보세요.'));return;}
  for(const at of candidates){
    const p=parts(at,base),button=element('button',`${label(base)} ${dateText(p)} ${timeText(p)} ${offsetText(p.offset)}`);button.type='button';
    button.addEventListener('click',()=>{setWall(at);render(at,people,duration,skipWeekends);$('status').textContent+=' · 공통 시간 적용';});$('suggestions').append(button);
  }
});
function summary(){return meetingSummary(current.epoch,current.duration,current.people,$('title').value.trim()||'국제 회의');}
$('copy').addEventListener('click',async()=>{
  if(!current)return;const text=summary();
  try{await navigator.clipboard.writeText(text);$('status').textContent='도시별 날짜·시간을 복사했습니다.';}
  catch{$('copy-fallback').value=text;$('copy-fallback').hidden=false;$('copy-fallback').focus();$('copy-fallback').select();$('status').textContent='복사용 일정을 선택했습니다. Ctrl / ⌘ + C로 복사하세요.';}
});
$('download').addEventListener('click',()=>{
  if(!current)return;
  const text=calendarFile({...current,title:$('title').value.trim()||'국제 회의',description:summary(),uid:crypto.randomUUID()+'@sicha-maru'});
  const url=URL.createObjectURL(new Blob([text],{type:'text/calendar;charset=utf-8'})),a=document.createElement('a');
  a.href=url;a.download='sicha-maru-meeting.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);$('status').textContent='캘린더 파일 다운로드를 시작했습니다.';
});
