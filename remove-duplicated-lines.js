/**
* 实现一个函数，用来移除文件中最长重复内容，注意，重复内容与被重复内容是相邻的，要求只保留第一个出现的内容。
* 例如以下文件内容：
* ```
* However, when you're working on multiple account/machine (e.g. desktop, notebook), you might want to merge the history file.
* In the past I use this way
* But the order is lost.
* This program aim to solve this program in a better way.
*
*
* However, when you're working on multiple account/machine (e.g. desktop, notebook), you might want to merge the history file.
* In the past I use this way
* But the order is lost.
* This program aim to solve this program in a better way.
* Comon on, let's do it.
*
* ```
* 移除后的文件内容为：
* ```
* However, when you're working on multiple account/machine (e.g. desktop, notebook), you might want to merge the history file.
* In the past I use this way
* But the order is lost.
* This program aim to solve this program in a better way.
* Comon on, let's do it.
*
* ```
*/

const fs = require('fs');
const path = require('path');
const _ = require('lodash');

/**统计子字符串在字符串中出现的次数 */
function count_substr(str, substr) {
  let count = 0;
  let index = str.indexOf(substr);
  while (index !== -1) {
    count++;
    index = str.indexOf(substr, index + substr.length);
  }
  return count;
}

/** 在一个数组中，查找元素最多的有序重复子数组 */
/**
给定一个数组arr，查找有序重复子数组B，子数组B可以通过arr.slice方法得到，子数组B最少出现2次，子数组B在所有符合的子数组中，包含的元素个数最多，且元素个数至少n个, 每个子数组B在数组arr中的位置不重叠，如果没有符合的，返回空数组。请使用Javascript编码。
例如，给定数组 ['ab', 'a', 'b', 'c', 'd', '', '\n', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'e', 'f', 'g']，及n=4，该算法将返回 ['a', 'b', 'c', 'd']，因为它是有序的重复子数组，且包含的元素个数大于等于4，且包含的元素个数最多，并且至少出现了 2 次， 第一次出现的子数组，和第二次出现的子数组元素在数组arr中不重叠。
*/
function findLongestRepeatingSubarray(arr, n = 0) {
  const subarrayCounts = {};
  let cache_keys = []
  let maxLength = 0;
  let longestRepeatingSubarray = [];

  for (let i = 0; i <= arr.length - n*2; i++) {
    for (let j = i + n + 1; j <= arr.length; j++) {
      if ((j - i) > arr.length/2) {
        break;
      }

      const subarray = arr.slice(i, j);
      const subarrayStr = subarray.join(",");
      if (subarrayStr.length === 0) {
        continue;
      }

      cache_keys.push(subarrayStr)

      if (!subarrayCounts[`${subarrayStr}`]) {
        subarrayCounts[subarrayStr] = [{ start: i, end: j }];
      } else {
        const existingIndices = subarrayCounts[`${subarrayStr}`];
        let isNonOverlapping = true;
        for (const indices of existingIndices) {
          if (
            (i >= indices.start && i < indices.end) ||
            (j > indices.start && j <= indices.end)
          ) {
            isNonOverlapping = false;
            break;
          }
        }
        if (isNonOverlapping) {
          subarrayCounts[`${subarrayStr}`].push({ start: i, end: j });
        }
      }
      if (
        subarrayCounts[`${subarrayStr}`].length >= 2 &&
        subarray.length > maxLength
      ) {
        // 优化内存
        const will_clean_cache_keys = cache_keys.filter(key => key.lenght < `${subarrayStr}`.length)
        will_clean_cache_keys.forEach(key => {
          subarrayCounts[key] = null;
          delete subarrayCounts[key];
        })

        delete will_clean_cache_keys;
        delete cache_keys;
        cache_keys = [`{subarrayStr}`];

        delete longestRepeatingSubarray;

        maxLength = subarray.length;
        longestRepeatingSubarray = subarray;
      }
    }
  }

  delete subarrayCounts;
  delete cache_keys;

  return longestRepeatingSubarray;
}


/** 查找最长重复的子字符串 */
function findLongestRepeatedSubstring(str) {
  let currentSubstring = "";
  const substringTable = {};

  for (let i = 0; i < str.length; i++) {
    for (let j = i; j < str.length; j++) {
      currentSubstring = str.substring(i, j + 1);
      if (currentSubstring.length > 0) {
        substringTable[`${currentSubstring}`] = {
          count: count_substr(str, currentSubstring),
          length: currentSubstring.length,
        };
      }
    }
    currentSubstring = "";
  }

  // 对substringTable进行过滤，只保留count > 1的项
  Object.keys(substringTable).forEach((key) => {
    if (substringTable[key].count <= 1) {
      delete substringTable[`${key}`];
    }
  });

  // 对substringTable进行排序，按照length进行排序, length 最大的排在最前面
  const sortedKeys = Object.keys(substringTable).sort((a, b) => {
    return substringTable[`${b}`].length - substringTable[`${a}`].length;
  });

  const longestSubstring = sortedKeys[0];

  // 计算重复次数
  const count = count_substr(str, longestSubstring);
  return {
    substring: longestSubstring,
    count,
  };
}

function _removeLines(text, duplicatedLines, { minLineCount, minLength } = {}) {
  // check
  if (duplicatedLines.length < minLength) return text;

  // check
  const lineCount = duplicatedLines.split("\n").length;
  if (lineCount < minLineCount) return text;

  // 从text中移除多余的subStr，只保留第一个
  const index = text.indexOf(duplicatedLines);
  const frontPart = text.substring(0, index + duplicatedLines.length);
  let backPart = text.substring(index + duplicatedLines.length);
  backPart = backPart.replaceAll(duplicatedLines, "");
  return frontPart + backPart;
}

/**
* 移除文件中最长重复内容，要求只保留第一个出现的内容。
*/
function removeDuplicatedLines(
  text,
  fnGetduplicatedLines,
  { minLength, minLineCount } = {
    minLength: 200,
    minLineCount: 4,
  },
) {
  const duplicatedLines = fnGetduplicatedLines(text);
  return _removeLines(text, duplicatedLines, { minLineCount, minLength });
}

function removeDuplicatedLinesQuick(
  content,
  { minLength, minLineCount } = {
    minLength: 200, // 最少文字数量 400
    minLineCount: 4, // 最小行数 7
  },
) {
  // 移除重复内容，只保留第一个
  finalContent = removeDuplicatedLines(
    content,
    (text) => {
      const arr = text.split("\n");
      const result = findLongestRepeatingSubarray(arr, minLineCount); // 使用最小行数，加速查找
      const duplicatedLines = result.join("\n");
      return duplicatedLines;
    },
    { minLength, minLineCount },
  );
  return finalContent;
}

// 快速删除Markdown文件中的重复内容，不管心重复内容后面是什么内容，只保留第一个
function delteDuplicatedLinesForMarkdown(content, checkLineCount = 14) {
  const lines = content.split("\n");

  // 针对有 --- 开头的内容，和没有 --- 开头的内容的处理, 最多检查36行
  const startIndexs = [0];
  for(let i = 0; i < _.min([lines.length, 36]); i++) {
    if (lines[i].trim() === `---`) {
      startIndexs.push(i);
      if (startIndexs.length >= 3) {
        break;
      }
    }
  }

  let beginIndex = _.last(startIndexs);
  let newContent = content;
  let nearestIndex = lines.length - 1;

  // 验证
  if (lines.length - beginIndex < checkLineCount)
    return content;

  for (let i = beginIndex; i < beginIndex + checkLineCount; i++) {
    const curLineContent = lines[i];
    const trimedLineContent = curLineContent.trim();
    // 正则表达式匹配， 以一个或n个#开头，后面跟着一个或多个空格
    if (trimedLineContent.match(/^#+\s+/)) {
      // 使用 /^#+\s+/
      const arr = trimedLineContent.split(/^#+\s+/);
      if (arr.length < 2) {
        continue;
      }

      // 检查 otherContent 包含的word数量
      const otherContent = arr.slice(1).join("");
      const wordCount = otherContent.split(" ").length;
      if (wordCount < 2) {
        continue;
      }

      const nextIndex = lines.indexOf(curLineContent, i + 1);
      if (nextIndex > i) {
        nearestIndex = _.min([nearestIndex, nextIndex])
      }
    }
  }

  if (nearestIndex < lines.length - 1) {
    console.log(`beginIndex: ${beginIndex}, nearestIndex: ${nearestIndex}`);
    newContent = lines.slice(0, nearestIndex).join("\n");
  }

  return newContent;
}

module.exports = {
  findLongestRepeatedSubstring,
  findLongestRepeatingSubarray,
  count_substr,
  removeDuplicatedLines,
  removeDuplicatedLinesQuick,
  delteDuplicatedLinesForMarkdown,
};
