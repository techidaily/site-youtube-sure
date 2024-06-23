/**
 * 编写顺序执行任务
 *
 * 1. 任务1： 每次只更新最旧的文件50个，解析出的创建时间, 更新时间。然后创建时间为当前时间减去1天，更新时间为当天时间
 * 2. 任务2： 执行 bun run publish
 */

const fs = require("node:fs");
const path = require("node:path");
const _ = require("lodash");
const { Buffer } = require("node:buffer");
const { execSync, spawnSync } = require("child_process");
const { delteDuplicatedLinesForMarkdown } = require("./remove-duplicated-lines");

const minRePublishHours = 24 * 7;
const maxAllPostCount = 20 * 1000;
const minNewPostCount = 28;
const maxNewPostCount = 100;
const maxContentLength = 60 * 1024; // 60K
const newPostSaveRootDir = path.join(__dirname, '../../', '_tmp_group') // "/home/ian/_tmp_group";

console.log(`newPostSaveRootDir: ${newPostSaveRootDir}`);

// 定义一个打印当前系统时间的函数
const nowDate = () => {
  const now = new Date();
  return `当前时间: ${now.toLocaleString()}`;
};

// 随机生成一个指定范围的整数
const randomIntFromInterval = (min, max) =>
  Math.floor(Math.random() * (max - min + 1) + min);

// 最常用且有效的洗牌算法是Fisher-Yates（也被称为Knuth）洗牌算法
function shuffle(array) {
  var currentIndex = array.length,
    temporaryValue,
    randomIndex;

  // 当还剩有元素未洗牌时
  while (0 !== currentIndex) {
    // 选取一个剩余元素
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // 并与当前元素交换
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}

function getSubDomain() {
  const subDomainName = path.basename(__dirname);
  const siteUrl = `https://${subDomainName.replace(
    /^site-/,
    "",
  )}.techidaily.com`;
  return siteUrl.replace(`techidaily.techidaily`, "techidaily");
}

function getBufferOrStringContent(content) {
  if (Buffer.isBuffer(content)) {
    return content.toString();
  }

  if (typeof content === "string") {
    return content;
  }

  return "";
}

/**
* 缩率图替换处理器
*/
class ThumbnailReplaceMapHelper {
  constructor() {
    this.file = "/home/ian/scripts/download-thumbnails-map.json"
    this.map = {}
    this.keys = []

    try {
      if (!fs.existsSync(this.file)) {
        console.log(`缩略图映射文件不存在: ${this.file}`)
        return;
      }

      const content = fs.readFileSync(this.file, "utf-8");
      this.map = JSON.parse(content);
      this.keys = Object.keys(this.map);
    } catch (e){
      console.error(e)
    }
  }

  getMap() {
    return this.map;
  }

  process(content = "") {
    let newContent = content;
    const host = "https://thmb.techidaily.com"
    const map = this.getMap();
    const keys = this.keys;
    for (const key of keys) {
      const value = map[key] || "";
      if (value.trim().length > 0) {
        const uri = `${host}/${value}`;
        newContent = newContent.replaceAll(key, uri);
      }
    }

    if (newContent !== content) {
      console.log(`===> 缩略图替换处理成功`);
    }

    return newContent;
  }
}

const gThumbnailReplaceMapHelper = new ThumbnailReplaceMapHelper();


class NeedNoticeUpdatedHelper {
  constructor() {
    this.siteUrl = getSubDomain();
    this.file = path.join(__dirname, ".need-notice-updated-posts.txt");
    this.posts = [];
  }

  addPost(file_path) {
    const url = `${this.siteUrl}/${file_path}/`;
    if (!this.posts.includes(url)) {
      this.posts.push(url)
    }
  }

  save() {
    try {
      fs.writeFileSync(this.file, this.posts.join("\n"))
    } catch (e) {}
  }
}

const gNeedNoticeUpdatedHelper = new NeedNoticeUpdatedHelper();

class LastPublishChecker {
  constructor() {
    this.lastPublishDate = null;
    this.lastPublishDateFile = path.join(__dirname, ".last-publish-date");
  }

  getLastPublishDate() {
    if (fs.existsSync(this.lastPublishDateFile)) {
      const content = fs.readFileSync(this.lastPublishDateFile, "utf-8");
      this.lastPublishDate = new Date(content);
    }

    return this.lastPublishDate;
  }

  saveLastPublishDate() {
    const now = new Date();
    fs.writeFileSync(this.lastPublishDateFile, now.toISOString());
    this.lastPublishDate = now;
  }

  findLastPublishDateFileIsExist() {
    return fs.existsSync(this.lastPublishDateFile);
  }

  check() {
    // 检查环境变量是否设置了强制更新
    const forceUpdate = process.env.FORCE_UPDATE_SITE;
    if (forceUpdate) {
      console.log("检测到环境变量FORCE_UPDATE设置为true，强制更新");
      return true;
    }

    const lastPublishDate = this.getLastPublishDate();
    const now = new Date();

    const minHours = process.env.MIN_PUBLISH_HOURS || minRePublishHours; // 根据需要调整

    if (lastPublishDate) {
      const diff = now - lastPublishDate;

      // 距离上一次发布不到n小时，忽略发布
      const diffHours = diff / (60 * 60 * 1000);
      if (diffHours < minHours) {
        console.log(
          `距离上一次发布不到${minHours}小时，忽略发布. 已经历时 ${diffHours} 小时`,
        );
        return false;
      }
    }

    return true;
  }
}

const gPublishHelper = new LastPublishChecker();

/**
 * 全局, 包含所有相关的网站的url2title的映射关系
 */
class GlobalUrl2TitleMapHelper {
  constructor() {
    this.url2titleMap = {};
    this.cacheFile = path.join(__dirname, "../", ".global-url2title-map.json");

    if (fs.existsSync(this.cacheFile)) {
      const content = fs.readFileSync(this.cacheFile, "utf-8");
      this.url2titleMap = JSON.parse(content);
    }
  }

  getMap() {
    return this.url2titleMap;
  }
}

// 修正title的显示
function fixDisplayTitle(input) {
  let title = input;

  // 如果title是以 `"\"` 为开头，以 `\""` 为结尾的字符串，需要去掉开头的 `"\"`，结尾的 `"\""`，得到中间的字符串
  if (title.startsWith(`"\\"`) && title.endsWith(`\\""`)) {
    title = title.slice(2, -2);
  }
  // 如果title是以 `"` 为开头，以 `"` 为结尾的字符串，需要去掉开头的 `"` 和 结尾的 `"`, 得到中间的字符串
  if (title.startsWith(`"`) && title.endsWith(`"`)) {
    title = title.slice(1, -1);
  }
  if (title.startsWith(`"`) && title.endsWith(`\\`)) {
    title = title.slice(1, -1);
  }

  return title;
}

// 全局的url2title的映射关系
const globalUrlMapHelper = new GlobalUrl2TitleMapHelper();
const globalUrlMap = globalUrlMapHelper.getMap();

/**
 * url 与 title 的映射关系
 */
class Url2TitleMapHelper {
  constructor() {
    this.url2titleMap = {};
    this.cacheFile = path.join(__dirname, ".url2title-map.json");

    if (fs.existsSync(this.cacheFile)) {
      const content = fs.readFileSync(this.cacheFile, "utf-8");
      this.url2titleMap = JSON.parse(content);
    }

    this.isChange = false;
    this.siteUrl = getSubDomain();
  }

  getMap() {
    return this.url2titleMap;
  }

  addUrl2Title(url, title) {
    const key = `${this.siteUrl}/${url}/`;
    let f_title = fixDisplayTitle(title);

    if (this.url2titleMap[key] !== f_title) {
      this.url2titleMap[key] = f_title;
      this.isChange = true;
    }
  }

  getTitleByUrl(url) {
    const key = `${this.siteUrl}/${url}/`;
    return this.url2titleMap[key];
  }

  save() {
    if (!this.isChange) return;
    fs.writeFileSync(
      this.cacheFile,
      JSON.stringify(this.url2titleMap, null, 2),
    );
  }

  // 获得除给定url以外的指定数量的随机新的url2title的分片映射，如果给定的url不存在, 返回随机的新的url2title的分片映射
  getShuffleUrl2TitleMap(url, maxCount = 15) {
    const filterKey = `${this.siteUrl}/${url}/`;

    const keys = Object.keys(this.url2titleMap);
    const shuffleKeys = shuffle(keys.filter((key) => key !== filterKey)).slice(
      0,
      maxCount,
    );

    const shuffleMap = {};

    // 本单元的url2title的映射关系
    shuffleKeys.forEach((key) => {
      if (key.startsWith(`https://`)) {
        shuffleMap[key] = this.url2titleMap[key];
      }
    });

    // 全局的url2title的映射关系
    const globalKeys = Object.keys(globalUrlMap);
    if (globalKeys.length === 0) return shuffleMap;

    const globalCount = randomIntFromInterval(10, maxCount);
    const globalShuffleKeys = shuffle(
      globalKeys.filter(
        (key) => key !== filterKey && !key.startsWith(`${this.siteUrl}/`),
      ),
    ).slice(0, globalCount);
    globalShuffleKeys.forEach((key) => {
      if (key.startsWith(`https://`)) {
        shuffleMap[key] = globalUrlMap[key];
      }
    });

    return shuffleMap;
  }
}

const urlMapHelper = new Url2TitleMapHelper();

// 删除不满足要求的文档
function isMarkdownFileWillDeleted(markdownFile, content, unlink = true) {
  if (content.length > maxContentLength // 大于60k的文件
    && !content.includes(`atpl-alsoreadstyle`)) { // 不包含 atpl-alsoreadstyle 的文件
    if (unlink) {
      // 直接删除文件
      console.log(`该文件不符合要求，删除: ${markdownFile}`);
      fs.unlinkSync(markdownFile);
      return true;
    }
  }

  return false;
}

function fixConentByLine(line) {
  // 字符串处理，以1个或者多个#开头的，后面跟着空格, 空格后面出现 ![**](**) 或者 [**](**)， 提取出 [**] 或者 ![**] 中的**部分，舍去其他部分
  // 例如： ## [You test](dfdfdf) => ## You test

  const match1 = line.match(/^(#+)\s*(.*?)\!\[\s*(.*?)\s*\]\s*\((.*?)\s*\)\s*/)
  if (match1) {
    const [_, prefix, content, imgAtl, imgUrl] = match1

    let part = ``;
    if (content.trim().length > 0) {
      part = `${content.trim()}\n\n`
    } else {
      part = `${imgAtl.trim()}\n\n`
    }

    if (imgUrl && imgUrl.trim().length > 0) {
      part = `${part}![${imgAtl.trim()}](${imgUrl.trim()})`
    }

    const lines = `${prefix} ${part}`.split('\n')
    return lines.map(line => fixConentByLine(line)).join('\n')
  }

  const match2 = line.match(/^(#+)\s*(.*?)\[\s*(.*?)\s*\]\s*\((.*?)\s*\)\s*/)
  if (match2) {
    const [_, prefix, content, title, url] = match2

    let part = ``;
    if (content.trim().length > 0) {
      part = `${content.trim()} ${title.trim()}`
    } else {
      part = `${title.trim()}`
    }

    const lines = `${prefix} ${part}`.split('\n')
    return lines.map(line => fixConentByLine(line)).join('\n')
  }

  return line
}

function fixMarkdownContent(content) {
  // 以下需要分行处理
  const lines = content.split('\n')
  content = lines.map(line => fixConentByLine(line)).join('\n')

  // 通用规则
  content = content.replace(/!\[\s*(.*?)\s*\]/g, '![$1]')
  content = content.replace(/!\s+\[\s*(.*?)\s*\]/g, '![$1]')
  content = content.replace(/\]\s+\(\s*(.*?)\s*\)/g, ']($1)')
  content = content.replace(/\]\s+\[\s*(.*?)\s*\]/g, '][$1]')

  content = content.replace(/\[\s*(.*?)\s*\]/g, '[$1]')
  content = content.replace(/\(\s*(.*?)\s*\)/g, '($1)')
  content = content.replace(/\]\s+\]/g, ']]')
  content = content.replace(/<br>/gi, '\n')
  return content
}

// 删除文档中的重复内容
function removeDuplicatedLinesFromContent(content) {
  // 由于历史原因，已经包含 also read 内容的，不做处理，直接返回原值
  if (content.includes(`atpl-alsoreadstyle`)) {
    console.log(`===> [跳过] 删除文档中的重复内容 文档已经包含 atpl-alsoreadstyle`);
    return content
  }

  let newContent = content;
  try {
    newContent = delteDuplicatedLinesForMarkdown(content)
    console.log(`===> 删除文档中的重复内容 => 旧文长度: ${content.length}, 新文长度: ${newContent.length}`);
  } catch (error) {
    console.error('error:', error);
  }

  return newContent
}

// 获得指定文件的相对路径, 相对于 source/_posts 目录, 去掉后缀名
function getRelativePathForPost(postPath) {
  const postsDir = path.join(__dirname, "source/_posts");
  const relativePath = path.relative(postsDir, postPath);
  return relativePath.replace(/\.md$/, "").replace(/\\/g, "/");
}

/**
 * 获得指定目录下所有的 .md 文件
 * @param {*} dir
 * @param {*} fileList
 * @returns
 */
function getMarkdownFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      getMarkdownFiles(filePath, fileList);
    } else if (path.extname(file) === ".md") {
      fileList.push(filePath);
    }
  });

  return fileList;
}

/**
 * 判断命令行参数是否包含指定的key
 * @param {*} key
 * @returns
 */
function isProcessArgsContains(key) {
  // 解析命令行参数
  const args = process.argv.slice(2);
  return args.includes(key);
}

/**
 * 清理系统内存
 * 参见：
 * (1) Ubuntu 查看及释放内存，缓存: https://zhuanlan.zhihu.com/p/269722663
 * (2) 在 Linux 中运行特定命令而无需 sudo 密码: https://zhuanlan.zhihu.com/p/60011904
 * (3) Ubuntu 18.04 change default editor: https://askubuntu.com/questions/1224741/ubuntu-18-04-change-default-editor
 */
const cleanMemoryTask = () => {
  command = "sudo echo 3 > sudo /proc/sys/vm/drop_caches";
  try {
    console.log(`执行 ${command} ${nowDate()}`);
    execSync(command, { cwd: __dirname });
  } catch (e) {
    console.error(e);
  }
};

const updatePostsTask = () => {
  const isFirstPublish = !gPublishHelper.findLastPublishDateFileIsExist();
  const allUpdateAndNewPosts = [];
  // 任务1：检测 source/_posts 目录下的所有.md文件，统计数量，如果数小于 < 20000 个, 拷贝新的.md文件到该目录下
  // 任务2：更新最旧的n个.md文件，更新时间为当前时间，创建时间为当前时间减去1天
  console.log(`新增文件及更新最旧的一定数量的文件. ${nowDate()}`);

  const postsDir = path.join(__dirname, "source/_posts");

  // 编写代码获得 source/_posts 目录下，包括子孙目录下的所有.md文件
  const posts = getMarkdownFiles(postsDir);
  posts.sort((a, b) => {
    const aStat = fs.statSync(a);
    const bStat = fs.statSync(b);

    return aStat.birthtime - bStat.birthtime;
  });

  // 不符合要求的 posts 要删除掉
  const removedPosts = [];

  // 根据posts的每一个文件的url，获得title
  posts.forEach((post) => {
    const fileUrl = getRelativePathForPost(post);
    if (urlMapHelper.getTitleByUrl(fileUrl)) return;

    const content = fs.readFileSync(post, "utf-8").trim();
    const willDeleted = isMarkdownFileWillDeleted(post, content, isFirstPublish);
    if (willDeleted) {
      removedPosts.push(post)
      return;
    }

    const title = content.match(/title: (.*)/)[1];

    if (title.trim().length <= 256) {
      // 违规的title不记录
      urlMapHelper.addUrl2Title(fileUrl, title);
    }
  });

  // 根据 removedPosts，整理 posts
  removedPosts.forEach((post) => {
    const index = posts.indexOf(post);
    if (index !== -1) {
      posts.splice(index, 1);
    }
  });

  // 解析命令行参数
  if (isProcessArgsContains("--only-map")) {
    urlMapHelper.save();
    console.log(`只更新url2title的映射关系，完成`);
    process.exit(0);
  }

  const updateDateWithContent = (content) => {
    // 时间为当前时间的前一天
    const createDate = new Date();
    createDate.setDate(createDate.getDate() - 1);
    const updateDate = new Date();

    let newContent = content.replace(
      /date: .*/,
      `date: ${createDate.toISOString()}`,
    );
    newContent = newContent.replace(
      /updated: .*/,
      `updated: ${updateDate.toISOString()}`,
    );

    console.log(`===> 更新date, updated`);

    return newContent;
  };

  // 检查及添加Google广告代码
  const addGoogleAds = (content) => {
    if (content.includes(`class="adsbygoogle"`))
      return content;

    console.log(`===> 添加Google广告代码`);
    return `${content}
<ins class="adsbygoogle"
      style="display:block"
      data-ad-client="ca-pub-7571918770474297"
      data-ad-slot="8358498916"
      data-ad-format="auto"
      data-full-width-responsive="true"></ins>
    `.trim()
  }

  // 添加AlsoRead代码
  const addAlsoReadContent = (url, content) => {
    if (content.includes(`atpl-alsoreadstyle`)) {
      console.log(`===> ${url} 已经有相关文章，跳过`);
      return content;
    }

    const shuffleMap = urlMapHelper.getShuffleUrl2TitleMap(
      url,
      randomIntFromInterval(7, 10),
    );
    console.log(
      `===> 为 ${url} 添加 ${Object.keys(shuffleMap).length} 条相关文章`,
    );
    if (Object.keys(shuffleMap).length === 0) return content;

    const format_posts = [];
    Object.keys(shuffleMap).forEach((link) => {
      let title = shuffleMap[link];
      title = fixDisplayTitle(title);

      // FIXME
      const uri = encodeURI(link);
      const linkElement = `<li><a href="${uri}"><u>${title}</u></a></li>`;
      format_posts.push(linkElement);
    });

    const alsoReadContent = [
      `<span class="atpl-alsoreadstyle">Also read:</span>`,
      "<div><ul>",
      format_posts.join("\n"),
      "</ul></div>",
    ].join("\n");

    return `${content}\n${alsoReadContent}\n`;
  };

  // 任务1: 旧文章先更新
  let oldestPosts = [...posts];

  if (!isFirstPublish) {
    // 如果不是第一次发布，只更新最旧的一定数量的文件
    oldestPosts = _.shuffle(oldestPosts);
    oldestPosts = oldestPosts.slice(0, randomIntFromInterval(200, 500));
  }

  // 开始更新处理
  oldestPosts.forEach((post, index) => {
    const postPath = post;
    const content = fs.readFileSync(postPath, "utf-8");

    try {
      // 尝试删除文档中的重复内容
      let newContent = removeDuplicatedLinesFromContent(content);
      newContent = fixMarkdownContent(newContent);

      // 处理 also read
      const url = getRelativePathForPost(postPath);
      newContent = addAlsoReadContent(url, newContent);

      // 处理广告
      newContent = addGoogleAds(newContent);

      // 处理缩略图替换
      newContent = gThumbnailReplaceMapHelper.process(newContent)

      // 只有内容发生变化，才更新时间
      if (newContent != content) {
        newContent = updateDateWithContent(newContent);
        fs.writeFileSync(postPath, newContent);
        allUpdateAndNewPosts.push(postPath);
        gNeedNoticeUpdatedHelper.addPost(url)

        console.log(`旧文章更新[${index}/${oldestPosts.length}] ${postPath} 完成`);
      }
    } catch (e) {
      console.error(`旧文章更新[${index}/${oldestPosts.length}] 💥错误: 更新文章 ${postPath} 失败`);
    }
  });

  // 任务2: 新文章, 更新时间要最新
  if (posts.length < maxAllPostCount) {
    // 获得当前目录的名称, // 去掉前缀 'site-'
    const dirName = path.basename(__dirname).replace(/^site-/, "");

    // 源目录的位置
    const sourceDir = path.join(newPostSaveRootDir, dirName);

    if (!fs.existsSync(sourceDir)) {
      console.error(`💥错误: 目录 ${sourceDir} 不存在，忽略`);
    } else {
      // 目标目录的位置
      const targetDir = path.join(__dirname, "source/_posts");

      // 每次至少拷贝 maxNewPostCount 个文件
      const new_posts = getMarkdownFiles(sourceDir);

      let new_files = new_posts.slice(0, randomIntFromInterval(minNewPostCount, maxNewPostCount));
      new_files = _.shuffle(new_files);
      new_files.forEach((file, index) => {
        console.log(`新文章[${index}/${new_files.length}] ${file} 处理中 ...`);

        const sourceFile = file;

        // 判断该文档是否满足要求，不符合要求的，要直接删除
        const content = fs.readFileSync(file, 'utf-8');
        const hasDeleted = isMarkdownFileWillDeleted(file, content);
        if (hasDeleted) { // 已经删除了，不符合要求
          return;
        }

        // 目标文件
        const targetFile = path.join(targetDir, file.replace(sourceDir, ""));

        const tDir = path.dirname(targetFile);
        if (!fs.existsSync(tDir)) {
          fs.mkdirSync(tDir, { recursive: true });
        }

        if (!fs.existsSync(targetFile) && fs.existsSync(sourceFile)) {
          try {
            fs.copyFileSync(sourceFile, targetFile);
            console.log(`拷贝 ${sourceFile} -> ${targetFile} 完成`);

            // 删除源文件
            if (fs.existsSync(targetFile)) {
              fs.unlinkSync(sourceFile);

              // 拷贝过去的文件也要更新一下时间
              // 尝试删除文档中的重复内容
              let newContent = removeDuplicatedLinesFromContent(content);
              newContent = fixMarkdownContent(newContent);

              // 处理 also read
              const url = getRelativePathForPost(targetFile);
              newContent = addAlsoReadContent(url, newContent);

              // 处理广告
              newContent = addGoogleAds(newContent);

              // 更新创建时间及更新时间
              newContent = updateDateWithContent(newContent);

              // 处理缩略图替换
              newContent = gThumbnailReplaceMapHelper.process(newContent)

              fs.writeFileSync(targetFile, newContent);
              allUpdateAndNewPosts.push(targetFile);

              // 添加到urlMap
              try {
                const fileUrl = getRelativePathForPost(targetFile);
                if (urlMapHelper.getTitleByUrl(fileUrl)) return;
                const title = newContent.match(/title: (.*)/)[1];

                if (title.trim().length <= 256) {
                  // 违规的title不记录
                  urlMapHelper.addUrl2Title(fileUrl, title);
                }
              } catch (e){
                console.error(`添加新文章 ${targetFile} 到urlMap失败`);
                console.error(e);
              }

            }
          } catch (e) {
            console.error(`拷贝 ${sourceFile} -> ${targetFile} 失败`);
            console.error(e);
          }
        } else {
          console.warn(`文件 ${targetFile} 已经存在，忽略`);
        }
      });
    }
  }

  gNeedNoticeUpdatedHelper.save();
  console.log(`更新完成, 共更新 ${allUpdateAndNewPosts.length} 篇文章`);
};

function tryCheckPushToGitHubSuccess(
  outOrError,
  refPushInfo,
  keyWords = "HEAD -> gh-pages",
) {
  let foundType = false;

  if (outOrError instanceof Error) {
    console.log(`outOrError is Error`);
    foundType = true;
    try {
      console.error(outOrError);
      if (outOrError.message.indexOf(keyWords) > -1) {
        refPushInfo.hasPushSuccess = true;
      }
      return;
    } catch (err) {}
  }

  if (typeof outOrError === "string" || Buffer.isBuffer(outOrError)) {
    console.log(`outOrError is String or Buffer`);
    foundType = true;

    const fmtContent = getBufferOrStringContent(outOrError).trim();
    console.log(`fmtContent: \n${fmtContent}\n>>>>>>>>\n`);
    console.log(`outOrError: \n${JSON.stringify({ fmtContent })}`);
    if (
      fmtContent.indexOf(keyWords) > -1 ||
      fmtContent === "Everything up-to-date"
    ) {
      refPushInfo.hasPushSuccess = true;
    }
    return;
  }

  try {
    const out = outOrError.output;
    if (out) {
      console.log(`outOrError has output`);
      foundType = true;

      const contentList = out.map((v) => getBufferOrStringContent(v));
      // 循环打印出每个buffer的内容
      contentList.forEach((v, index) => {
        console.log(`contentList[${index}]: [${JSON.stringify(v)}]`);
      });

      const criticalErrors = [
        `fatal: 无法访问 'https://github.com/`,
        `spawnSync /bin/sh ENOBUFS`,
        `fatal: 远端意外挂断了`,
      ];

      const foundKeyword = contentList.some((v) => v.indexOf(keyWords) > -1);
      const foundEverythingUpToDate = contentList.some(
        (v) => v === "Everything up-to-date\n",
      );
      const foundCriticalError = contentList.some((v) =>
        criticalErrors.some((ce) => v.indexOf(ce) > -1),
      );

      console.log(
        `foundKeyword: ${foundKeyword}, foundEverythingUpToDate: ${foundEverythingUpToDate}, foundCriticalError: ${foundCriticalError}`,
      );

      if ((foundKeyword || foundEverythingUpToDate) && !foundCriticalError) {
        refPushInfo.hasPushSuccess = true;
        return;
      }
    }
  } catch (e) {}

  try {
    const out = outOrError.stdout;
    if (out) {
      console.log(`outOrError has stdout`);
      foundType = true;

      const content = getBufferOrStringContent(out);
      if (content.indexOf(keyWords) > -1) {
        refPushInfo.hasPushSuccess = true;
        return;
      }
    }
  } catch (e) {}
  try {
    const out = outOrError.stderr;
    if (out) {
      console.log(`outOrError has stderr`);
      foundType = true;

      const content = getBufferOrStringContent(out);
      if (content.indexOf(keyWords) > -1) {
        refPushInfo.hasPushSuccess = true;
        return;
      }
    }
  } catch (e) {}

  if (!foundType) {
    console.log(`warning: 未找到outOrError的类型: ${typeof outOrError}`);
  }
}

const proxyAddress = "http://192.168.3.16:7890";
const globalEnv = { HTTPS_PROXY: proxyAddress, HTTP_PROXY: proxyAddress };

const publishTask = () => {
  console.log(`当前目录为: ${__dirname}`);

  let error = null;
  const refPushInfo = { hasPushSuccess: false };

  try {
    // 不要使用 git pull origin main，因为可能会导致冲突
    // try {
    // console.log(`执行 git gc --prune=now. ${nowDate()}`);
    // execSync(`git pull origin main`, { cwd: __dirname });
    // } catch (e) { }

    console.log(`执行 bun install 安装依赖. ${nowDate()}`);
    // 设置最多重新安装 5 次
    let retry = 5;
    while (retry > 0) {
      try {
        const maxBuffer = 100 * 1024 * 1024;
        execSync(`bun install`, { cwd: __dirname, maxBuffer });
        break;
      } catch (e) {
        console.log(`安装失败，重试中...`);
        retry--;
      }
    }

    try {
      console.log(`执行 git gc --prune=now. ${nowDate()}`);
      execSync(`git gc --prune=now`, { cwd: __dirname });
      execSync(`git gc --prune=now`, { cwd: `${__dirname}/.deploy_git` });
    } catch (e) {}

    try {
      // 500MB=1024*1024*500, 将本地 http.postBuffer 数值调整到GitHub服务对应的单次上传大小配置
      console.log(
        `执行 git config --global http.postBuffer 1048576000  ${nowDate()}`,
      );
      execSync(`git config --global http.postBuffer 1048576000`, {
        cwd: __dirname,
      });
      execSync(`git config --global https.postBuffer 1048576000`, {
        cwd: `${__dirname}/.deploy_git`,
      });
    } catch (e) {}

    // 全新构建，删除中间产物, 减少中间的干扰
    const need_rm_build = false; // 2024年4月15日，当前配置已经很稳定，不再删除中间产物，
    try {
      if (need_rm_build) {
        execSync(`rm -fr ./docs`, { cwd: __dirname });
        execSync(`rm -fr ./.deploy_git`, { cwd: __dirname });
      }
    } catch (e) {}

    // 先执行一下清理内存的操作
    cleanMemoryTask();

    console.log(`执行 yarn run publish. ${nowDate()}`);
    const out = spawnSync("yarn", ["run", "publish"], {
      cwd: __dirname,
      maxBuffer: 100 * 1024 * 1024,
      env: { ...process.env, ...globalEnv },
    });
    tryCheckPushToGitHubSuccess(out, refPushInfo);
  } catch (e) {
    console.log(`代码错误:\n`);
    console.error(e);
    tryCheckPushToGitHubSuccess(e, refPushInfo);
  }

  if (!refPushInfo.hasPushSuccess) {
    // 尝试调用try-deploy.js
    try {
      console.log(`尝试调用 try-deploy.js. ${nowDate()}`);
      const success = require(path.join(__dirname, "try-deploy.js"));
      refPushInfo.hasPushSuccess = success;
    } catch (e) {
      console.error(e);
    }
  }

  if (refPushInfo.hasPushSuccess) {
    gPublishHelper.saveLastPublishDate();
    urlMapHelper.save();
  } else {
    console.log(`发布失败`);
    throw new Error("发布失败");
  }
  console.log(`执行完成`);
};

const backupGit = () => {
  // 最多每12小时备份一次，检测上一次备份的时间，如果超过12小时，执行备份, 防止出现频繁备份及关键数据丢失
  // 最近一次备份的时间，存储在 .backup-date 文件中
  const now = new Date();
  let enableBackup = false;
  const backupDateFile = path.join(__dirname, ".backup-date");

  if (fs.existsSync(backupDateFile)) {
    const content = fs.readFileSync(backupDateFile, "utf-8");
    const lastBackupDate = new Date(content);
    enableBackup = now - lastBackupDate > 12 * 60 * 60 * 1000;

    if (!enableBackup) {
      console.log("距离上一次备份时间不到12小时，忽略备份");
      return;
    }
  } else {
    enableBackup = true;
    console.log(`第一次备份`);
  }

  if (!enableBackup) return;

  console.log("准备备份 git 仓库");
  try {
    const isInstallGitLFS = fs.existsSync(path.join(__dirname, ".git/lfs"));
    // 如果没有安装 git lfs，需要删除 .gitattributes 文件
    if (!isInstallGitLFS) {
      try {
        execSync(`git rm .gitattributes`, { cwd: __dirname });
      } catch (e) {}
    }

    // 添加关键文章内容
    try {
      console.log(`git add source/ 添加关键文章内容`);
      execSync(`git add source/ `, {
        cwd: __dirname,
        maxBuffer: 100 * 1024 * 1024,
      });
      execSync(`git add themes/ `, {
        cwd: __dirname,
        maxBuffer: 100 * 1024 * 1024,
      });

      // 需要备份的关键文件
      execSync(
        `git add _config.redefine.yml _config.yml package.json readme.md`,
        {
          cwd: __dirname,
          maxBuffer: 100 * 1024 * 1024,
        },
      );

      // 需要备份的关键文件
      execSync(
        `git add init.js submit.bing.js`,
        {
          cwd: __dirname,
          maxBuffer: 100 * 1024 * 1024,
        },
      );
    } catch (e) {}

    // 提交
    try {
      console.log(`git commit -m "auto backup on ${now.toISOString()}"`);
      execSync(`git commit -m "auto backup on ${now.toISOString()}"`, {
        cwd: __dirname,
        maxBuffer: 100 * 1024 * 1024,
      });
    } catch (e) {
      console.error(e);
    }

    // 推送到远程仓库
    const tryPushToGitHub = (args) => {
      const refPushInfo = { hasPushSuccess: false };
      let finalPushSuccess = false;
      let tryTimes = 5;
      while (tryTimes-- > 0) {
        try {
          const out = spawnSync(`git`, [...args], {
            cwd: __dirname,
            maxBuffer: 100 * 1024 * 1024,
            env: { ...process.env, ...globalEnv },
          });
          tryCheckPushToGitHubSuccess(out, refPushInfo, "main -> main");
          if (refPushInfo.hasPushSuccess) {
            finalPushSuccess = true;
            break;
          }
        } catch (e) {
          console.error(e)
        }
      }

      if (!finalPushSuccess) {
        throw new Error("备份失败");
      }
    }

    // ------------------ git push begin -----------------------
    if (!isInstallGitLFS) {
      tryPushToGitHub([`push`, `origin`, `main`, `--force`]);
    }

    if (isInstallGitLFS) {
      tryPushToGitHub([`lfs`, `push`, `origin`, `main`]);
    }
    // ------------------ git push end -----------------------

    // 更新备份时间
    fs.writeFileSync(backupDateFile, now.toISOString());
    console.log(`备份完成`);
  } catch (e) {
    console.error(e);
    console.log(`备份失败，下一次再执行备份`);
  }
};

// 执行自定义任务文件
const execCustomTask = () => {
  const task_file = path.join(__dirname, "custom-task.js");
  if (fs.existsSync(task_file)) {
    console.log(`执行自定义任务文件 ${task_file}`)
    try {
      require(task_file);
    } catch (e) {
      console.log(`执行自定义任务文件 ${task_file} 失败`)
      console.error(e);
    }
  }
}

const cleanPM2Logs = () => {
  console.log(`清理 pm2 日志`);
  try {
    execSync(`pm2 flush`, {
      cwd: __dirname,
      maxBuffer: 100 * 1024 * 1024,
    });
    console.log(`清理 pm2 日志完成`);
  } catch (e) {
    console.error(e);
  }
};


// 只执行更新文章的任务
if (isProcessArgsContains("--only-update-posts")) {
  cleanPM2Logs();
  execCustomTask();
  updatePostsTask();
  cleanMemoryTask();
  process.exit(0);
}

// 解析命令行参数， 只处理map
if (isProcessArgsContains("--only-map")) {
  cleanPM2Logs();
  execCustomTask();
  updatePostsTask();
  cleanMemoryTask();
  process.exit(0);
}

// 解析命令行参数，如果出现限制每天执行的时间段，例如: 21:00 - 07:00 时间段内执行
if (isProcessArgsContains("--only-night")) {
  // 获得当前时间，要小时部分
  const nowHour = (new Date()).getHours();
  if (nowHour <= 6 || nowHour >= 21) {
    normalRunTask();
  } else {
    console.log("当前时间不在 21:00 - 07:00 时间段内，不执行任务");
  }
}


// 正常执行任务
if (gPublishHelper.check()) {
  normalRunTask();
}


function normalRunTask() {
  cleanPM2Logs();
  execCustomTask();
  // 执行任务队列
  backupGit();
  updatePostsTask();
  publishTask();
  backupGit();
  // 清理内存的操作
  cleanMemoryTask();
}
