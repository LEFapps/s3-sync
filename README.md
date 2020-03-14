# s3-sync - Asynchronous recursive file & directory copying to S3

Based on [ncp](https://github.com/AvianFlu/ncp), s3-sync recursively copies a directory to an S3 bucket.

Think `cp -r`, but pure node, and asynchronous.  `s3-sync` can be used both as a CLI tool and programmatically, e.g. from within a lambda function, or as a Serverless plugin.

The biggest difference with e.g. [https://github.com/k1LoW/serverless-s3-sync](this s3-sync serverless plugin) is the fact that this library does _not_ just empty or delete the contents of the S3 bucket, but rather compares the MD5 hash (ETag) of local files with the S3 Object. In this way, it detects if the contents have changed and only uploads what is necessary. The library can also notify a CloudFront instance of paths that need invalidation, without having to invalidate the entire site.

Especially for web applications that have a need for rather large static files that aren't changed often, this can make a very big difference.

Links are currently not supported (yet).

## Command Line usage

Usage: `s3-sync [source] [bucket] [--filter=filter] [--limit=concurrency limit] [--accessKeyId=AWS access key] [--secretAccessKey=Secret AWS access key] --region=[region] --cloudFrontId=[CloudFront Distribution ID] [--cleanup] [--quiet] [--verbose]`

`source` is the directory to copy from. `bucket` is the S3 target bucket to synchronize to. `CloudFrontId` is the CloudFront instance connected to the bucket (if present). 

The `filter` is a Regular Expression - matched files will be copied.

The `limit` is an integer that represents how many pending file system requests are run at a time.

`stoponerr` is a boolean flag that will stop copying immediately if any
errors arise, rather than attempting to continue while logging errors. The default behavior is to complete as many copies as possible, logging errors along the way.

`cleanup` is a boolean flag that will make the library attempt to remove objects from the S3 bucket that are *not* present on the local (source) directory. Note that this proceess will only delete S3 objects that have tag `origin` with the value `s3-sync`. This tag is added automatically to any objects created by the lib. 

`verbose` will output a lot more information to the console.

## Serverless plugin



## Programmatic usage
  
Programmatic usage of `s3-sync` is just as simple.  The only argument to the completion callback is a possible error.  

```javascript
var s3_sync = require('s3_sync');

s3_sync.limit = 16;

s3_sync(source, bucket, options, function (err) {
 if (err) {
   return console.error(err);
 }
 console.log('done!');
});
```

Options:
  * `options.aws` __(required)__: - AWS configuration options. This should include `region`, `accessKeyId` and `secretAccessKey`.

  * `options.filter` - a `RegExp` instance, against which each file name is
  tested to determine whether to copy it or not, or a function taking single
  parameter: copied file name, returning `true` or `false`, determining
  whether to copy file or not.

  * `options.transform` - a function: `function (read, write) { read.pipe(write) }`
  used to apply streaming transforms while copying.

  * `options.clobber` - boolean=true. if set to false, `ncp` will not overwrite 
  destination files that already exist.

  * `options.dereference` - boolean=false. If set to true, `ncp` will follow symbolic
  links. For example, a symlink in the source tree pointing to a regular file
  will become a regular file in the destination tree. Broken symlinks will result in
  errors.

  * `options.stopOnErr` - boolean=false.  If set to true, `ncp` will behave like `cp -r`,
  and stop on the first error it encounters. By default, `ncp` continues copying, logging all
  errors and returning an array.

  * `options.errs` - stream. If `options.stopOnErr` is `false`, a stream can be provided, and errors will be written to this stream.

Please open an issue if any bugs arise.  As always, I accept (working) pull requests, and refunds are available at `/dev/null`.
