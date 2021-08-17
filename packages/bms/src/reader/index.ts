// Public: A module that takes a buffer, detects the character set, and
// returns the decoded string.
//
// The Reader follows [ruv-it!’s algorithm](http://hitkey.nekokan.dyndns.info/cmds.htm#CHARSET)
// for detecting the character set.
//
import { ReaderOptions, ReadCallback } from './types'
import chardet from 'bemuse-chardet/bemuse-chardet'
import iconv from 'iconv-lite'

/**
 * Reads the buffer, detect the character set, and returns the decoded
 * string synchronously.
 *
 * @returns the decoded text
 * @public
 */
export function read(
  buffer: Buffer,
  options: ReaderOptions | null = null
): string {
  var charset = (options && options.forceEncoding) || chardet.detect(buffer)
  var text = iconv.decode(buffer, charset)
  if (text.charCodeAt(0) === 0xfeff) {
    // BOM?!
    return text.substr(1)
  } else {
    return text
  }
}

/**
 * Like `read(buffer)`, but this is the asynchronous version.
 *
 * @public
 */
export function readAsync(
  buffer: Buffer,
  options: ReaderOptions | null,
  callback?: ReadCallback
): void

/**
 * Like `read(buffer)`, but this is the asynchronous version.
 *
 * @public
 */
export function readAsync(buffer: Buffer, callback?: ReadCallback): void

export function readAsync(...args: any[]) {
  let buffer: Buffer = args[0]
  let options: ReaderOptions | null = args[1]
  let callback: ReadCallback = args[2]
  if (callback) {
    options = args[1]
    callback = args[2]
  } else {
    options = null
    callback = args[1]
  }
  setTimeout(function() {
    var result
    try {
      result = { value: exports.read(buffer, options) }
    } catch (e) {
      result = { error: e as Error }
    }
    if (result.error) {
      callback!(result.error)
    } else {
      callback!(null, result.value)
    }
  })
}

export { getReaderOptionsFromFilename } from './getReaderOptionsFromFilename'
