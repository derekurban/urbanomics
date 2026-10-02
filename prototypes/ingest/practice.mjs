export const receipts = [
  ['Northstar Studio','Payroll deposit',2840,'03 SEP','Everyday account','NS'],
  ['Jamie Park','Interac e-Transfer',68,'04 SEP','Everyday account','JP'],
  ['Interest payment','Monthly interest',14.26,'05 SEP','Savings account','↗'],
  ['Fieldwork Supply','Card refund',89.95,'06 SEP','Credit account','FS'],
  ['Alex Morgan','Interac e-Transfer',120,'07 SEP','Everyday account','AM'],
  ['Sam Rivera','Interac e-Transfer',46.50,'08 SEP','Everyday account','SR'],
  ['Marketplace sale','Direct deposit',240,'09 SEP','Everyday account','↙'],
  ['Taylor Chen','Interac e-Transfer',82,'10 SEP','Everyday account','TC'],
  ['Northstar Studio','Payroll deposit',2840,'11 SEP','Everyday account','NS'],
  ['Riley Brooks','Interac e-Transfer',155,'12 SEP','Everyday account','RB'],
  ['Willow Market','Card refund',32.80,'13 SEP','Credit account','WM'],
  ['Jordan Lee','Interac e-Transfer',54,'14 SEP','Everyday account','JL'],
  ['Juniper Kitchen','Dining out',-86.40,'15 SEP','Credit account','JK'],
  ['Cedar Market','Groceries',-142.18,'15 SEP','Everyday account','CM'],
  ['Bluebird Coffee','Coffee & cafes',-6.75,'16 SEP','Credit account','BC'],
  ['City Transit','Transport',-112,'16 SEP','Everyday account','CT'],
  ['Maya Chen','Shared dinner',43.20,'17 SEP','Everyday account','MC'],
  ['Atlas Books','Books',-38.90,'17 SEP','Credit account','AB'],
  ['Harbour Electric','Utilities',-74.30,'18 SEP','Everyday account','HE'],
  ['Freelance project','Client payment',680,'18 SEP','Everyday account','FP'],
  ['Pine Pharmacy','Health',-27.55,'19 SEP','Credit account','PP'],
  ['Sunday Flowers','Gifts',-45,'19 SEP','Everyday account','SF'],
  ['Rowan Fitness','Membership',-59,'20 SEP','Credit account','RF'],
  ['Casey Lee','Weekend repayment',125,'20 SEP','Everyday account','CL'],
  ['Northstar Studio','Payroll deposit',2840,'21 SEP','Everyday account','NS'],
  ['Meadow Home','Household',-214.60,'21 SEP','Credit account','MH'],
  ['Wildwood Cinema','Entertainment',-32,'22 SEP','Credit account','WC'],
  ['Interest payment','Monthly interest',18.73,'22 SEP','Savings account','↗'],
  ['Copper Bowl','Takeout',-29.80,'23 SEP','Everyday account','CB'],
  ['Summit Outfitters','Clothing',-96.45,'23 SEP','Credit account','SO'],
  ['Morgan Ellis','Interac e-Transfer',52,'24 SEP','Everyday account','ME'],
  ['Cloudline Mobile','Phone bill',-48,'24 SEP','Everyday account','CM'],
  ['Lakeview Lodge','Travel',-326,'25 SEP','Credit account','LL'],
  ['Harbour Music','Subscription',-12.99,'25 SEP','Credit account','HM'],
  ['Marketplace sale','Used desk',175,'26 SEP','Everyday account','↙'],
  ['Cedar Market','Groceries',-63.87,'26 SEP','Credit account','CM'],
  ['Bluebird Coffee','Coffee & cafes',-11.25,'27 SEP','Everyday account','BC'],
  ['Avery Stone','Shared household purchase',107.30,'27 SEP','Everyday account','AS'],
  ['Oak Dental','Health',-185,'28 SEP','Credit account','OD'],
  ['Home rent','Housing',-1475,'28 SEP','Everyday account','HR'],
  ['Willow Market','Return refund',41.99,'29 SEP','Credit account','WM'],
  ['Trailhead Fuel','Transport',-68.12,'29 SEP','Credit account','TF'],
  ['Interest payment','Monthly interest',21.04,'30 SEP','Savings account','↗'],
  ['Juniper Kitchen','Dining out',-123.50,'30 SEP','Credit account','JK'],
  ['Northstar Studio','Payroll deposit',2840,'01 OCT','Everyday account','NS'],
  ['Cedar Market','Groceries',-118.32,'01 OCT','Everyday account','CM'],
  ['Riley Brooks','Shared trip',210,'02 OCT','Everyday account','RB'],
  ['Maple Bakery','Breakfast',-18.40,'02 OCT','Credit account','MB'],
  ['Studio North','Design tools',-24,'03 OCT','Credit account','SN'],
  ['Weekend project','Client payment',450,'03 OCT','Everyday account','WP'],
  ['City Parking','Transport',-8,'04 OCT','Everyday account','CP'],
  ['Pine Pharmacy','Health',-16.85,'04 OCT','Credit account','PP'],
  ['Sam Rivera','Shared groceries',59.16,'05 OCT','Everyday account','SR'],
  ['Harbour Internet','Utilities',-79,'05 OCT','Everyday account','HI'],
  ['Meadow Home','Kitchenware',-72.40,'06 OCT','Credit account','MH'],
  ['Interest payment','Monthly interest',19.62,'06 OCT','Savings account','↗'],
  ['Copper Bowl','Takeout',-34.90,'07 OCT','Everyday account','CB'],
  ['Summit Outfitters','Return refund',96.45,'07 OCT','Credit account','SO'],
  ['Juniper Kitchen','Dining out',-78.60,'08 OCT','Credit account','JK'],
  ['Neighbourhood Fund','Donation',-25,'08 OCT','Everyday account','NF'],
];

// Dedicated illustrative pairs: exact, fee, and competing candidates.
receipts.push(
  ['Transfer received','From another account',500,'09 OCT','Everyday account','↔'],
  ['Transfer sent','To Everyday account',-500,'09 OCT','Savings account','↔'],
  ['Card payment received','Possible card payment',247.50,'10 OCT','Credit account','↔'],
  ['Card payment sent','To Credit account',-250,'09 OCT','Everyday account','↔'],
  ['Transfer received','Two possible matches',300,'11 OCT','Everyday account','↔'],
  ['Transfer sent','Online transfer',-300,'11 OCT','Savings account','↔'],
  ['Transfer sent','Online transfer',-300,'10 OCT','Savings account','↔']
);
export const transferCases = new Map([[60,[61]],[62,[63]],[64,[65,66]]]);
export const incomeTags=['Paycheck','Interest','Freelance','Sale','Gift','Reimbursement','Refund','Other'];
export const expenseGroups={
  Food:['Groceries','Restaurants','Coffee & cafes','Takeout'],
  Home:['Household','Utilities','Rent','Furniture'],
  Personal:['Clothing','Health','Fitness','Gifts'],
  Life:['Transport','Travel','Entertainment','Subscriptions','Donations','Other']
};
export class Practice {
  constructor(){this.reset();}
  reset(){this.tags=new Map();this.transfers=new Map();this.history=[];}
  linked(){return new Set([...this.transfers].filter(([,v])=>v!==null).flat());}
  pending(){return new Set([...transferCases].filter(([id])=>!this.transfers.has(id)).flatMap(([id,ids])=>[id,...ids]));}
  matches(id,f){
    const r=receipts[id];
    const relevant=f.flow==='transfers'?transferCases.has(id)&&!this.transfers.has(id):
      !this.tags.has(id)&&!this.linked().has(id)&&!this.pending().has(id)&&(r[2]<0?'expenses':'income')===f.flow;
    return relevant&&(f.account==='all'||r[4]===f.account)&&(!f.search||r.slice(0,2).join(' ').toLowerCase().includes(f.search.toLowerCase()));
  }
  save(action){
    const {id,type}=action,r=receipts[id];if(!r)throw Error('This card is no longer available.');
    if(type==='link'||type==='dismiss'){
      if(!transferCases.has(id)||this.transfers.has(id))throw Error('This transfer has already been resolved.');
      if(type==='link'){
        if(!transferCases.get(id).includes(action.target)||this.linked().has(action.target))throw Error('Choose an available matching payment.');
        if(Math.round((Math.abs(receipts[action.target][2])-r[2])*100)!==0&&!action.acknowledged)throw Error('Confirm the difference before linking.');
      }
    }else if(type==='tag'){
      if(this.tags.has(id)||this.pending().has(id)||this.linked().has(id))throw Error('This card is no longer available for tagging.');
      const allowed=r[2]>0?incomeTags:Object.values(expenseGroups).flat(),parts=action.parts||[];
      if(!parts.length||new Set(parts.map(p=>p.tag)).size!==parts.length||parts.some(p=>!allowed.includes(p.tag)||!Number.isInteger(p.cents)||p.cents<=0)||parts.reduce((n,p)=>n+p.cents,0)!==Math.round(Math.abs(r[2])*100))throw Error('Allocate the full amount across your selected tags.');
    }else throw Error('Choose a decision first.');
    this.history.push({tags:new Map(this.tags),transfers:new Map(this.transfers),flow:type==='tag'?(r[2]>0?'income':'expenses'):'transfers',id});
    if(type==='tag')this.tags.set(id,action.parts.map(p=>({...p})));else this.transfers.set(id,type==='link'?action.target:null);
    return type==='tag'?`Tagged ${r[0]}`:type==='link'?'Transfer linked — both sides removed from tagging':'Suggestion dismissed — these transactions are available for tagging';
  }
  undo(){const last=this.history.pop();if(!last)return null;this.tags=last.tags;this.transfers=last.transfers;return last;}
}
