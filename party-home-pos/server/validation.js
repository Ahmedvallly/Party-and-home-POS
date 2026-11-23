export function textValue(value,max=200,required=false){if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw new Error('Please complete the required fields with valid text.');return value.trim();}
export function integer(value,min=0,max=100000000){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max)throw new Error('Enter a valid whole number within the allowed range.');return value;}
export function price(value){return integer(value,0,100000000);}
export function canSeeCost(role){return role==='owner'||role==='supervisor';}
export const publicProductFields='id,sku,name,description,packaging,category,unit,image,stock,low,p1,p2,p3,p4,p5,active,version';
export function username(value){
 const name=typeof value==='string'?value.trim().toLowerCase():'';
 if(!name)throw new Error('Enter a username.');
 return name;
}
