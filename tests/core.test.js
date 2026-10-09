import test from 'node:test';
import assert from 'node:assert/strict';
import {parts,wallText,possibleInstants,parseWall,availability,findCommon,calendarFile,meetingSummary,offsetText,CITIES,MINUTE} from '../dist/core.js';
test('winter/summer conversion, dates and fractional offsets',()=>{
  const winter=possibleInstants('2026-01-15T09:00','Asia/Seoul')[0], summer=possibleInstants('2026-07-15T09:00','Asia/Seoul')[0];
  assert.equal(new Date(winter).toISOString(),'2026-01-15T00:00:00.000Z');
  assert.equal(wallText(winter,'America/New_York'),'2026-01-14T19:00');
  assert.equal(wallText(summer,'America/New_York'),'2026-07-14T20:00');
  assert.equal(offsetText(parts(winter,'Asia/Kathmandu').offset),'UTC+05:45');
  assert.equal(offsetText(parts(winter,'America/New_York').offset),'UTC−05:00');
});
test('DST gaps, duplicate hour, half-hour change and skipped day are explicit',()=>{
  assert.deepEqual(possibleInstants('2026-03-08T02:30','America/New_York'),[]);
  assert.deepEqual(possibleInstants('2026-11-01T01:30','America/New_York').map(x=>new Date(x).toISOString()),['2026-11-01T05:30:00.000Z','2026-11-01T06:30:00.000Z']);
  assert.deepEqual(possibleInstants('2026-10-04T02:15','Australia/Lord_Howe'),[]);
  const howe=possibleInstants('2026-04-05T01:45','Australia/Lord_Howe');
  assert.equal(howe.length,2);assert.equal(howe[1]-howe[0],30*MINUTE);
  assert.deepEqual(possibleInstants('2011-12-30T12:00','Pacific/Apia'),[]);
});
test('all curated zones round trip and browser system timezone is irrelevant',()=>{
  for(const [zone] of CITIES){
    const epoch=Date.UTC(2027,5,8,12,15), wall=wallText(epoch,zone);
    assert.ok(possibleInstants(wall,zone).includes(epoch),zone);
  }
  assert.throws(()=>parseWall('2026-02-29T12:00'));
  assert.throws(()=>parseWall('1999-12-31T12:00'));
  assert.throws(()=>parseWall('2026-01-01T24:00'));
  assert.throws(()=>possibleInstants('2026-01-01T12:00','Etc/Unknown'));
  assert.equal(parseWall('2028-02-29T12:00').day,29);
});
test('whole meeting must fit work hours and local weekend, including midnight',()=>{
  const people=[{zone:'Asia/Seoul',start:9,end:18}];
  const monday=possibleInstants('2026-10-05T17:30','Asia/Seoul')[0];
  assert.deepEqual(availability(monday,30,people),[true]);
  assert.deepEqual(availability(monday,31,people),[false]);
  const saturday=possibleInstants('2026-10-10T10:00','Asia/Seoul')[0];
  assert.deepEqual(availability(saturday,60,people),[false]);
  assert.deepEqual(availability(saturday,60,people,false),[true]);
  const fridayNight=Date.UTC(2026,9,9,23,30);
  assert.deepEqual(availability(fridayNight,60,[{zone:'UTC',start:0,end:24}]),[false]);
  assert.throws(()=>availability(monday,0,people));
  assert.throws(()=>availability(monday,60,[{zone:'UTC',start:18,end:9}]));
});
test('common slots cover duration for every participant with no false matches',()=>{
  const start=Date.UTC(2026,9,5,7),people=[{zone:'Europe/London',start:9,end:18},{zone:'Europe/Berlin',start:9,end:18}];
  const results=findCommon(start,60,people);
  assert.equal(results[0],Date.UTC(2026,9,5,8));assert.equal(results.length,6);
  results.forEach(epoch=>assert.deepEqual(availability(epoch,60,people),[true,true]));
  const far=[{zone:'Asia/Seoul',start:9,end:18},{zone:'America/New_York',start:9,end:18}];
  assert.deepEqual(findCommon(start,60,far),[]);
});
test('ICS uses UTC duration through DST and escapes/folds UTF-8 text safely',()=>{
  const epoch=Date.UTC(2026,10,1,5,30),description=meetingSummary(epoch,90,[{zone:'America/New_York',start:0,end:24}]);
  const file=calendarFile({epoch,duration:90,title:'회의; 중요한, 일정\n새 줄 '+ '가나다😀'.repeat(30),description,uid:'test-123@sicha-maru',now:epoch});
  assert.ok(file.includes('DTSTART:20261101T053000Z\r\n'));
  assert.ok(file.includes('DTEND:20261101T070000Z\r\n'));
  assert.ok(file.includes('SUMMARY:회의\\; 중요한\\, 일정\\n새 줄'));
  assert.ok(description.includes('UTC−04:00')&&description.includes('UTC−05:00'));
  for(const line of file.split('\r\n'))assert.ok(Buffer.byteLength(line,'utf8')<=75);
  assert.ok(!file.includes('\ufffd'));
  assert.throws(()=>calendarFile({epoch,duration:60,uid:'x\r\nATTENDEE:bad'}));
});
