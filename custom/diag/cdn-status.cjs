const { cdn } = require('./tc.js');
(async () => {
  // 1. 域名状态
  const d = await cdn('DescribeDomains', { Limit: 20 });
  const list = (d.Response && d.Response.Domains) || [];
  for (const x of list) {
    console.log('域名      :', x.Domain);
    console.log('  状态    :', x.Status);
    console.log('  CNAME   :', x.Cname);
    console.log('  类型    :', x.ServiceType, '| 区域:', x.Area);
    console.log('  创建    :', x.CreateTime, '| 更新:', x.UpdateTime);
    console.log('  源站    :', JSON.stringify(x.Origin && x.Origin.Origins));
    console.log('  HTTPS   :', JSON.stringify(x.Https));
    console.log('  项目ID  :', x.ProjectId);
    console.log('');
  }
  console.log('TotalCount:', d.Response && d.Response.TotalCount);
  if (d.Response && d.Response.Error) console.log('ERR:', JSON.stringify(d.Response.Error));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
