// 解析 RSS XML
function parseRSS(xml: string): { feed: FeedInfo; articles: Article[] } {
  // 提取 channel 信息
  const channelMatch = xml.match(/<channel>([\s\S]*?)<\/channel>/);
  if (!channelMatch) {
    throw new Error('Invalid RSS format: no channel found');
  }

  const channel = channelMatch[1];

  // 先解析 feed 信息
  const feed: FeedInfo = {
    title: extractTag(channel, 'title') || '未知标题',
    link: extractTag(channel, 'link') || '#',
    description: extractTag(channel, 'description') || '',
  };

  // 解析文章列表
  const articles: Article[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(channel)) !== null) {
    const item = match[1];
    const title = extractTag(item, 'title') || '无标题';
    const link = extractTag(item, 'link') || '#';
    const content = extractTag(item, 'description') || '';
    const pubDate = extractTag(item, 'pubDate') || '';

    articles.push({
      title: decodeHtmlEntities(title),
      auther: feed.title,  // 直接使用 feed 的 title
      date: formatDate(pubDate),
      link,
      content: cleanContent(content),
    });
  }

  return { feed, articles };
}
