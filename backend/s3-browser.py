import argparse
import boto3
import logging
import os

from flask import Flask, jsonify, g, request
from jinja2 import Template
from botocore.exceptions import EndpointResolutionError, EndpointConnectionError, ClientError

logging.basicConfig(filename='s3-browser.log', level=logging.WARNING,
                    format='%(asctime)s - %(levelname)s - %(message)s',
                    datefmt='%m/%d/%Y %I:%M:%S %p')
logging.info('==== Starting new run ====')
    
app = Flask(__name__)

class S3Browser:
    
    '''A simple S3 browser class that lists buckets, objects and calculates the total size of the objects in the bucket.
    
    Attributes:
        endpoint_url (str): The URL of the S3 endpoint
        access_key (str): The AWS access key
        secret_key (str): The AWS secret key
        s3_resource (S3Resource): The S3 resource object
        bucket_name (str): The name of the S3 bucket
    Methods:
        list_buckets(): Lists all the S3 buckets
        calculate_total_size(): Calculates the total size of all objects in the S3 bucket
        calculate_folder_size(folder_path): Calculates the total size of all objects in the specified folder
        list_bucket_objects(): Lists all objects in the S3 bucket
    '''
    bucket_name = ''
    
    def __init__(self, endpoint_url, access_key, secret_key):
        self.buckets = []
        self.s3_resource = boto3.resource('s3', 
            endpoint_url=endpoint_url, 
            aws_access_key_id=access_key, 
            aws_secret_access_key=secret_key)
        self.buckets = self.list_buckets()
        
    def list_buckets(self):
        buckets = []
        for bucket in self.s3_resource.buckets.all():
            buckets.append(bucket.name)
        return buckets
    
    def calculate_total_size(self):
        total_size = 0

        # List all objects in the S3 bucket
        bucket = self.s3_resource.Bucket(self.bucket_name)
        for obj in bucket.objects.all():
            total_size += obj.size

        return total_size

    def calculate_folder_size(self, folder_path):
        total_size = 0

        # List all objects in the specified folder
        bucket = self.s3_resource.Bucket(self.bucket_name)
        for obj in bucket.objects.filter(Prefix=folder_path):
            total_size += obj.size

        return total_size
    
    def list_bucket_objects(self):
        objects = []
        bucket = self.s3_resource.Bucket(self.bucket_name)
        for obj in bucket.objects.all():
            obj_json = {
                'key': obj.key,
                'size': obj.size,
                'last_modified': obj.last_modified
                }
            objects.append(obj_json)
        return objects
    
class ArgumentParser:
    
    args = False
    
    def __init__(self):
        self.parser = argparse.ArgumentParser()
        self.parser.add_argument('--mode', '-m', choices=['standalone', 'ui'], help='Operating mode')
        self.parser.add_argument('--bucket_name', '-b', help='S3 bucket name')
        self.parser.add_argument('--access_key', '-k', help='AWS access key')
        self.parser.add_argument('--secret_key', '-s', help='AWS secret key')
        self.parser.add_argument('--endpoint','-e', help='S3 endpoint URL')
        self.parser.add_argument('--folder_path','-f', help='S3 folder path')

    def parse_args(self):
        args = self.parser.parse_args()

        # Check if the mode is set in the OS environment
        if os.environ.get('MODE') == 'standalone':
            args.mode = 'standalone'
        elif os.environ.get('MODE') == 'ui':
            args.mode = 'ui'
        elif not args.mode:
            self.parser.error('Mode must be specified')
        if args.mode == 'standalone':
            # Check if OS environment variables exist
            if 'BUCKET_NAME' in os.environ and 'ACCESS_KEY' in os.environ and 'SECRET_KEY' in os.environ and 'ENDPOINT' in os.environ:
                args.bucket_name = os.environ['BUCKET_NAME']
                args.access_key = os.environ['ACCESS_KEY']
                args.secret_key = os.environ['SECRET_KEY']
                args.endpoint = os.environ['ENDPOINT']
            if 'FOLDER_PATH' in os.environ:
                args.folder_path = os.environ.get('FOLDER_PATH')
            elif not args.folder_path:
                args.folder_path = '/'
            elif not args.bucket_name or not args.access_key or not args.secret_key or not args.endpoint:
                self.parser.error('In standalone mode, bucket_name, access_key, secret_key, endpoint and folder name must be specified')

        return args

def json_response(status, msg):
  response = jsonify({
      "status":status,
      "message": msg})
  response.headers.add('Access-Control-Allow-Origin', '*')
  response.headers.add('Access-Control-Allow-Headers', '*')
  response.headers.add('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  return response

# 404 error for non-existing URLs.
@app.errorhandler(404)
def page_not_found(e):
    template = Template('''
      Error {{ code }} : The requested page does not exist.
    ''')
    return template.render(code=404)

@app.route('/', methods=['OPTIONS'])
def return_headers():
    return json_response('Ok', 'Preflight request accepted.')

@app.route('/', methods=['GET'])
def home():    
    if 's3_browser' not in app.config:
        return json_response('Error', None)
    else:
        return json_response('Ok', app.config['s3_browser'].list_buckets())

@app.route('/', methods=['POST'])
def set_args():
    '''Set the S3 endpoint, access key and secret key, create the S3 browser object,
    and in case of success, list the buckets.
    '''
    req = request.get_json()
    args.endpoint = req["endpoint"]
    args.access_key = req["key"]
    args.secret_key = req["secret"]
    try:
        s3 = S3Browser(args.endpoint, args.access_key, args.secret_key)
    except ClientError as e:
        logging.error(e)
        if 'InvalidBucketName' in str(e) or 'NoSuchBucket' in str(e):
            return json_response('Error',['BucketError']),200
        elif 'InvalidAccessKeyId' in str(e) or 'SignatureDoesNotMatch' in str(e):
            return json_response('Error',['AccessError']),200
        return json_response('Error',['ClientError']),200
    except EndpointConnectionError as e:
        logging.error(e)
        return json_response('Error',['EndpointConnectionError']),200
    except EndpointResolutionError as e:
        logging.error(e)
        return json_response('Error',['EndpointResolutionError']),200
    except:
        logging.error('Unknown error')
        return json_response('Error',['UnknownError']),200
    app.config['s3_browser'] = s3
    return json_response('Ok',app.config['s3_browser'].list_buckets())

@app.route('/buckets', methods=['GET'])
def buckets():
    if 's3_browser' in app.config:
        return json_response('Ok', app.config['s3_browser'].buckets)
    else:
        return json_response('Error', None)    


@app.route('/objects', methods=['GET'])
def objects():
    # At the moment no checks are made as this endpoint should be used
    # only if the S3 browser object is set.
    if 's3_browser' in app.config:
        s3_browser = app.config['s3_browser']
        return json_response('Ok', s3_browser.list_bucket_objects())
    else:
        return json_response('Error', None)
    
if __name__ == "__main__":
    arg_parser = ArgumentParser()
    global args 
    args = arg_parser.parse_args()


    # Use the parsed arguments as needed
    # ...
    if args.mode == 'standalone':  
        s3_browser = S3Browser(args.endpoint, args.access_key, args.secret_key)
        s3_browser.bucket_name = args.bucket_name
        if args.folder_path == '/':
            print(s3_browser.calculate_total_size())
        else:
            print(s3_browser.calculate_folder_size(args.folder_path))
    if args.mode == 'ui':
        if args.endpoint and args.access_key and args.secret_key:
            app.config['s3_browser'] = S3Browser(args.endpoint, args.access_key, args.secret_key)
        app.run(debug=True, host='0.0.0.0', port='5001')