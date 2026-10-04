import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLanguage} from '../backend/language.mjs';
test('Framely language codes map to upstream Termix translations',()=>{
 for(const [input,output] of [['en-US','en'],['ja-JP','ja'],['fr-FR','fr'],['zh_Hant_HK','zh-TW'],['zh-CN','zh-CN'],['pt-BR','pt-BR'],['es-MX','es-ES'],['unknown','en']])assert.equal(normalizeLanguage(input),output);
});
