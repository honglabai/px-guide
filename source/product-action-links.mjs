import {productSubcategory,coupangSearchUrl} from './product-ui.mjs';
import {coupangAppUrl} from './coupang-banner.js';
export function productActionLinks(product,userAgent=''){
 const params=new URLSearchParams({category:product.category,subcategory:productSubcategory(product)});
 return {coupang:coupangAppUrl(coupangSearchUrl(product.name),userAgent),compare:'/products/?'+params.toString(),detail:'/products/'+encodeURIComponent(product.slug)+'/'};
}
