import {majors,leaves} from './classification.mjs';
import {reclassify} from './codes.mjs';
import {decode} from './model.mjs';
import {encodeValue} from './merge-data.mjs';
export function screenCategory(major,middle,tax){
 if(tax==='duty_free')return '면세주류';
 if(major==='식품')return middle==='과자'?'과자류':middle==='아이스크림'?'아이스크림':'음료·식품';
 if(major==='음료')return '커피 음료';if(major==='건강식품')return '음료·식품';if(major==='화장품')return '화장품';if(major==='개인위생·케어')return '생활용품';if(major==='생활용품')return middle==='세탁용품'?'세제':'생활용품';if(major==='의류·잡화')return '의류';if(major==='주류')return '주류';throw Error('Unknown major');
}
export function applyCategoryReview(original,prior,review){
 const tables=structuredClone(original);let registry=structuredClone(prior);
 const categories=new Map(tables.catalog_categories.map(r=>[r[3],r]));let nextCategoryId=Math.max(...tables.catalog_categories.map(r=>r[0]))+1;
 const node=(code,name,parent)=>{let r=categories.get(code);if(r){if(r[4]!==name||r[1]!==parent)throw Error('Conflicting taxonomy '+code);return r[0];}r=[nextCategoryId++,parent,code.length/2,code,name];tables.catalog_categories.push(r);categories.set(code,r);return r[0];};
 for(const l of leaves){const major=l.code.slice(0,2),middle=l.code.slice(0,4);node(l.code,l.name,node(middle,l.middle,node(major,majors[major],null)));}
 const changes=[],selected=new Set(),texts=new Map(tables.catalog_texts);
 for(const row of review){
  if(row.status==='추가 확인')continue;if(!['수정 권장','세분화 제안'].includes(row.status)||selected.has(row.id))throw Error('Invalid reviewed selection');selected.add(row.id);
  const leaf=leaves.find(l=>majors[l.code.slice(0,2)]===row.proposed[0]&&l.middle===row.proposed[1]&&l.name===row.proposed[2]);const p=tables.catalog_products.find(p=>p[0]===row.id);if(!leaf||!p)throw Error('Missing reviewed product/category '+row.id);
  const current=[...categories.values()].find(c=>c[0]===p[4]),old=tables.catalog_codes.find(c=>c[1]===p[0]&&c[3]===1);if(!old||old[0].slice(0,6)!==current[3])throw Error('Invalid current code');const target=categories.get(leaf.code);
  if(p[4]===target[0]){if(!registry[p[1]]?.requests?.['category-review-20261024'])throw Error('Unexpected pre-existing target');continue;}
  const middle=categories.get(current[3].slice(0,4)),major=categories.get(current[3].slice(0,2));if(JSON.stringify([major[4],middle[4],current[4]])!==JSON.stringify(row.current)||old[0]!==row.code)throw Error('Review baseline changed '+row.id);
  const assigned=reclassify(registry,p[1],leaf.code,'category-review-20261024');registry=assigned.registry;old[3]=0;tables.catalog_codes.push([assigned.code,p[0],target[0],1]);p[4]=target[0];
  const fields={category:screenCategory(row.proposed[0],row.proposed[1],p[5]),subcategory:leaf.name,productGroup:leaf.name};for(const record of tables.catalog_records.filter(r=>r[0]===p[0]))record[2]=encodeValue(tables,{...decode(JSON.parse(record[2]),texts),...fields});
  changes.push({no:row.no,id:p[0],slug:p[1],oldCode:row.code,newCode:assigned.code,from:row.current,to:row.proposed});
 }
 const sequences=new Map(tables.catalog_sequences);for(const r of Object.values(registry))for(const code of [r.code,...r.history||[]]){const id=categories.get(code.slice(0,6))?.[0];if(!id)throw Error('Unknown historical category');sequences.set(id,Math.max(sequences.get(id)||0,Number(code.slice(6))));}tables.catalog_sequences=[...sequences];return {tables,registry,changes};
}
