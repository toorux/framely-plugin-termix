import languages from './languages.json' with {type:'json'};
export function normalizeLanguage(code){
  const normalized=code.replaceAll('_','-').toLowerCase();
  const exact=languages.find(l=>l.value.toLowerCase()===normalized);if(exact)return exact.value;
  const base=normalized.split('-')[0];
  if(base==='zh')return /(?:hant|tw|hk|mo)/.test(normalized)?'zh-TW':'zh-CN';
  const same=languages.find(l=>l.value===base)??languages.find(l=>l.value.toLowerCase().startsWith(base+'-'));
  return same?.value??'en';
}
