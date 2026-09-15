## Included

### POST /properties/529569356:runReport
Run a report. The body takes `dateRanges` (`startDate` and `endDate` as `YYYY-MM-DD`, `today`, `yesterday` or `NdaysAgo`), `metrics` and `dimensions` as `[{"name": "..."}]`, and optionally `dimensionFilter`, `orderBys` and `limit`. Metric names include `activeUsers`, `newUsers`, `sessions`, `screenPageViews`, `eventCount` and `userEngagementDuration`; dimension names include `date`, `country`, `deviceCategory`, `pagePath`, `sessionDefaultChannelGroup` and `sessionSource`.

### POST /properties/529569356:runRealtimeReport
Report on the last 30 minutes by default. The body accepts `dimensions`, `metrics`, `dimensionFilter`, `metricFilter`, `limit`, `metricAggregations`, `orderBys`, `returnPropertyQuota` and `minuteRanges`. Realtime metrics include `activeUsers` and `eventCount`; dimensions include `country`, `deviceCategory` and `unifiedScreenName`. For other names, use the [realtime schema](https://developers.google.com/analytics/devguides/reporting/data/v1/realtime-api-schema).
Example body: `{"dimensions":[{"name":"country"}],"metrics":[{"name":"activeUsers"},{"name":"eventCount"}],"limit":"10"}`

### POST /properties/529569356:batchRunReports
Run up to five reports in one call. The body takes `requests`, an array of runReport bodies.

### GET /properties/529569356/metadata
List the dimensions and metrics available for this property's core reports, custom ones included. Read it before a core report that needs a name this page does not document. Realtime reports have a separate schema linked above.

### POST /properties/529569356:checkCompatibility
Check whether dimensions and metrics can be queried together in core reports. The body accepts only `dimensions`, `metrics`, `dimensionFilter`, `metricFilter` and `compatibilityFilter` (set to `COMPATIBLE` to return compatible options).
Example body: `{"dimensions":[{"name":"country"}],"metrics":[{"name":"sessions"},{"name":"eventCount"}],"compatibilityFilter":"COMPATIBLE"}`
