// 網頁入口：東方航路（打字玩的大航海，副官葉嵐）。對外 API 是 seaApi（Sea_Router.gs）。
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index').setTitle('東方航路')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
