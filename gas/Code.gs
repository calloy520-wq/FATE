// 網頁入口：聖杯之路（Fate 題材的卡牌冒險）。遊戲規則全在 Game.html、跑在玩家的瀏覽器裡。
function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate().setTitle('聖杯之路')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function include(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }
