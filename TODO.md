
To eliminate "stale" objects:

- give all objects under control of the s3-sync lib (inside the specified dir to be synced) a tag that corresponds to this specific deployment
e.g. add `deployment` tag with GUID


- use s3.listObjectsV2 to generate a full list of objects in the bucket, compare to the list of objects in the sync dir

Use something like to figure out if missing files have an older tag:
```
aws s3api get-object-tagging --bucket dev.schaliegasvrij.be --key index.html --profile thomasgoorden
{
    "TagSet": [
        {
            "Key": "deployment",
            "Value": "9e3ece1f-f5c7-4641-92ea-65f2a55d4c7d"
        }
    ]
}
```

Remove objects with older tags (or "soft delete" by making them non-public).

