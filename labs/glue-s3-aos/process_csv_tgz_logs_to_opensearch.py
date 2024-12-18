import sys
from awsglue.transforms import *
from awsglue.utils import getResolvedOptions
from awsglue.dynamicframe import DynamicFrame
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.job import Job
from pyspark.sql.functions import udf
from pyspark.sql.types import StructType, StructField, StringType, ArrayType
from io import BytesIO
import tarfile
import csv
import pandas as pd

# Initialize Glue context
sc = SparkContext()
glueContext = GlueContext(sc)
spark = glueContext.spark_session
job = Job(glueContext)

# Get job parameters
args = getResolvedOptions(sys.argv, ['JOB_NAME', 'opensearch_connection_name', 's3_input_path'])

# Define UDF to read tar.gz files
@udf(returnType=ArrayType(StringType()))
def read_tar_gz_with_pandas(content):
    try:
        with BytesIO(content) as file_obj:
            with tarfile.open(fileobj=file_obj, mode="r:gz") as tar:
                csv_file = next(f for f in tar.getmembers() if f.name.endswith('.csv'))
                extracted = tar.extractfile(csv_file)
                df = pd.read_csv(extracted)
                return df.to_dict('records')
    except Exception as e:
        return [str(e)]

# Read S3 files
input_path = args['s3_input_path']
df = spark.read.format("binaryFile").load(input_path)

# Apply UDF to extract CSV data
extracted_df = df.select(read_tar_gz_with_pandas("content").alias("data")).select("data.*")

# Write to OpenSearch
glueContext.write_dynamic_frame.from_options(
    frame=DynamicFrame.fromDF(extracted_df, glueContext, "extracted_df"),
    connection_type="opensearch",
    connection_options={
        "connectionName": args['opensearch_connection_name'],
        "write.batch.size": "1000",
        "write.batch.max.bytes": "10485760",
        "write.batch.max.docs": "1000"
    }
)

job.commit()
