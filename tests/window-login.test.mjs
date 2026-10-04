import {test} from 'node:test';
import assert from 'node:assert/strict';
import {windowTickets} from '../backend/window-login.mjs';
test('window tickets expire, are single use and are cleared on service stop',()=>{
 let now=100;const tickets=windowTickets(()=>now);
 const first=tickets.issue();assert.match(first,/^[a-f0-9]{64}$/);
 assert.equal(tickets.consume('guess'),false);assert.equal(tickets.consume(first),true);assert.equal(tickets.consume(first),false);
 const expired=tickets.issue();now+=30000;assert.equal(tickets.consume(expired),false);
 const stopped=tickets.issue();tickets.clear();assert.equal(tickets.consume(stopped),false);
});
