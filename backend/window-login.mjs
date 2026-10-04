import {randomBytes} from 'node:crypto';

// Tickets are issued through the authenticated Framely bridge, never HTTP.
export function windowTickets(now=Date.now) {
  const tickets=new Map();
  return {
    issue(){
      for(const [key,expiry] of tickets)if(expiry<=now())tickets.delete(key);
      if(tickets.size>=128)throw Error('Too many pending window logins');
      const ticket=randomBytes(32).toString('hex');tickets.set(ticket,now()+30000);return ticket;
    },
    consume(ticket){const expiry=tickets.get(ticket);tickets.delete(ticket);return expiry!==undefined&&expiry>now();},
    clear(){tickets.clear();},
  };
}
