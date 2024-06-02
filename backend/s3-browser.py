import argparse
import boto3
import logging
import os

from flask import Flask, jsonify, request, session
from flask_session import Session
from flask_cors import CORS
from botocore.exceptions import EndpointResolutionError, EndpointConnectionError, ClientError

logging.basicConfig(filename='s3-browser.log', level=logging.DEBUG,
                    format='%(asctime)s - %(levelname)s - %(message)s',
                    datefmt='%m/%d/%Y %I:%M:%S %p')
logging.info('==== Starting new run ====')
    
app = Flask(__name__)
app.config['SECRET_KEY'] = 'yololo24'

CORS(app, supports_credentials=True, resources={r"/*": {"origins": "*"}})
# Session(app)

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
    
    def __init__(self, endpoint_url, access_key, secret_key):
        self.buckets = []
        self.endpoint_url = endpoint_url
        self.access_key = access_key
        self.secret_key = secret_key
    
    def s3_resource(self):
        return boto3.resource('s3', 
            endpoint_url=self.endpoint_url, 
            aws_access_key_id=self.access_key, 
            aws_secret_access_key=self.secret_key)
        
    def s3_client(self):
        return boto3.client('s3', 
            endpoint_url=self.endpoint_url, 
            aws_access_key_id=self.access_key, 
            aws_secret_access_key=self.secret_key)
        
    def list_buckets(self):
        buckets = []
        for bucket in self.s3_resource().buckets.all():
            buckets.append(bucket.name)
        return buckets
    
    def calculate_total_size(self):
        total_size = 0

        # List all objects in the S3 bucket
        bucket = self.s3_resource().Bucket(self.bucket_name)
        for obj in bucket.objects.all():
            total_size += obj.size

        return total_size

    def calculate_folder_size(self, folder_path):
        total_size = 0

        # List all objects in the specified folder
        bucket = self.s3_resource().Bucket(self.bucket_name)
        for obj in bucket.objects.filter(Prefix=folder_path):
            total_size += obj.size

        return total_size
    
    def list_bucket_objects(self, bucket, folder_path=''):
        objects = []
        bucket = self.s3_resource().Bucket(bucket)
        for obj in bucket.objects.filter(Prefix=folder_path):
            obj_json = {
                'key': obj.key,
                'size': obj.size,
                'last_modified': obj.last_modified
                }
            objects.append(obj_json)
        return objects
    
    def list_bucket_objects_v2(self, bucket, folder_path=''):
        objects = []
        res = self.s3_client().list_objects_v2( \
            Bucket=bucket, Delimiter='/', Prefix=folder_path)
        if 'CommonPrefixes' in res:
            for _ in res['CommonPrefixes']:
                objects.append({'key' : _['Prefix'],
                                'size': None,
                                'last_modified': None,
                                'type': 'folder'
                                }) 
        if 'Contents' in res:
            objects = objects + [
                { 'key':_['Key'], 
                  'size': _['Size'],
                  'last_modified': _['LastModified'],
                  'type': 'object'} for _ in res['Contents']]
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
  #response.headers.add('Access-Control-Allow-Origin', '*')
#   response.headers.add('Access-Control-Allow-Headers',"*")
#   response.headers.add('Access-Control-Allow-Credentials', 'true')
#   response.headers.add('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  return response


@app.route('/buckets', methods=['OPTIONS'])
@app.route('/bucket', methods=['OPTIONS'])
@app.route('/', methods=['OPTIONS'])
def return_headers():
    return json_response('Ok', 'Preflight request accepted.')

@app.route('/', methods=['GET'])
def home():
    session.clear()
    if session:
        response = {}
        for key in session:
            if key != 'access_key' and key != 'secret_key':
                response[key] = session[key]
        return response, 200
    else:
        return "", 404

@app.route('/', methods=['POST'])
def set_args():
    '''Set the S3 endpoint, access key and secret key, create the S3 browser object,
    and in case of success, list the buckets.
    '''
    req = request.get_json()
    session['endpoint'] = req["endpoint"]
    session['access_key'] = req["key"]
    session['secret_key'] = req["secret"]
    logging.info('Testing S3 connection...')
    try:
        s3_buckets = S3Browser(
            session['endpoint'], session['access_key'], session['secret_key'])\
                .list_buckets()
    except ConnectionRefusedError as e:
        logging.error(e)
        return json_response('Error',['ConnectionRefusedError']),200
    except ClientError as e:
        logging.error(e)
        if 'InvalidBucketName' in str(e) or 'NoSuchBucket' in str(e):
            return json_response('Error',['BucketError']),200
        elif 'InvalidAccessKeyId' in str(e) or 'SignatureDoesNotMatch' in str(e):
            logging.error('Access error')
            return json_response('Error','AccessError'),200
        return json_response('Error',['ClientError']),200
    except EndpointConnectionError as e:
        logging.error(e)
        return json_response('Error',['EndpointConnectionError']),200
    except EndpointResolutionError as e:
        logging.error(e)
        return json_response('Error',['EndpointResolutionError']),200
    except Exception as e:
        logging.error('Unknown error: %s', str(e))
        return json_response('Error',['UnknownError']),200

    session["buckets"] = s3_buckets
    logging.info('S3 connection works, buckets listed and saved in session: %s',\
        str(s3_buckets))
    return jsonify({"status": "Ok" ,"message": s3_buckets}), 200
    #return json_response("OK" ,s3_buckets), 200

@app.route('/size', methods=['GET'])
def size() -> dict:
    if 'bucket' in session:
        s3_browser = S3Browser(session["endpoint"], 
            session["access_key"], session["secret_key"])
        s3_browser.bucket_name = session["bucket"]
        if 'prefix' in request.args:
            return {"size" : s3_browser.calculate_folder_size(request.args.get('prefix'))}, 200
        else:
            return {"size" : 0}, 404
        
@app.route('/buckets', methods=['GET'])
def buckets():
    if 'buckets' not in session:
        session["buckets"] = S3Browser(session["endpoint"], 
                session["access_key"], session["secret_key"]).list_buckets()
        return json_response('Ok', session["buckets"])
    else:
        return json_response('Error', None)    

@app.route('/bucket', methods=['POST'])
def set_bucket():
    req = request.get_json()
    session["bucket"] = req["bucket"]
    logging.info('Bucket set to %s.', session["bucket"])
    return jsonify(session["bucket"]), 200

@app.route('/objects', methods=['GET'])
def objects():
    # At the moment no checks are made as this endpoint should be used
    # only if the S3 browser object is set.

    prefix = request.args.get('prefix') if 'prefix' in request.args else ''
    if 'bucket' in session:
        bucket:str = session["bucket"]
        print(f'Bucket: {bucket} Prefix: {prefix}' )
        logging.info("Listing objects in bucket %s and prefix %s",\
                     bucket, prefix)
        session['objects'] = S3Browser(session["endpoint"],
                        session["access_key"],
                        session["secret_key"])\
            .list_bucket_objects_v2(bucket, prefix)
        return session['objects'], 200
    else:
        return jsonify('Error'), 404

    
if __name__ == "__main__":
    arg_parser = ArgumentParser()
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
        app.run(debug=True, host='0.0.0.0', port='5001')
