from flask import Flask, request, jsonify
from flask_cors import CORS
import psycopg2
from urllib.parse import urlparse
import re

app = Flask(__name__)
CORS(app)

DB_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'database': 'postgres',
    'user': 'postgres',
    'password': 'maneruzan',
}

def get_db_connection():
    return psycopg2.connect(**DB_CONFIG)

def extract_domain(url):
    try:
        parsed = urlparse(url)
        if not parsed.netloc and parsed.path:
            domain = parsed.path.split('/')[0]
        else:
            domain = parsed.netloc

        domain = re.sub(r'^www\.', '', domain)
        domain = domain.split(':')[0]

        return domain.lower()
    except Exception as e:
        print(f"Error parsing URL {url}: {e}")
        return url.lower()

@app.route('/api/check-url', methods=['POST'])
def check_url():
    data = request.json
    url = data.get('url')

    if not url:
        return jsonify({'error': 'URL is required'}), 400

    print(f"🔍 Checking URL: {url}")
    domain = extract_domain(url)
    print(f"  Domain: {domain}")

    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT official_url
            FROM legitimate_sites
            WHERE official_url = %s LIMIT 1
        """, (domain,))

        legit_result = cur.fetchone()
        if legit_result:
            print(f"✅ Found in legitimate: {legit_result[0]}")
            cur.close()
            conn.close()
            return jsonify({'category': 'legitimate'})

        cur.execute("""
            SELECT suspicious_url
            FROM suspicious_sites
            WHERE suspicious_url = %s LIMIT 1
        """, (domain,))

        suspicious_result = cur.fetchone()
        if suspicious_result:
            print(f"🚫 Found in suspicious: {suspicious_result[0]}")
            cur.close()
            conn.close()
            return jsonify({'category': 'suspicious'})

        print(f"❓ Not found in database")
        cur.close()
        conn.close()
        return jsonify({'category': 'unknown'})

    except psycopg2.OperationalError as e:
        print(f"❌ Database connection error: {e}")
        return jsonify({'error': 'Database connection failed'}), 500
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/test', methods=['GET'])
def test():
    return jsonify({'status': 'API is working'})

@app.route('/api/db-test', methods=['GET'])
def db_test():
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("SELECT COUNT(*) FROM legitimate_sites")
        legit_count = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM suspicious_sites")
        suspicious_count = cur.fetchone()[0]

        cur.execute("SELECT official_url FROM legitimate_sites LIMIT 5")
        legit_examples = [row[0] for row in cur.fetchall()]

        cur.execute("SELECT suspicious_url FROM suspicious_sites LIMIT 5")
        suspicious_examples = [row[0] for row in cur.fetchall()]

        cur.close()
        conn.close()

        return jsonify({
            'database_connection': 'success',
            'legitimate_sites': legit_count,
            'suspicious_sites': suspicious_count,
            'legitimate_examples': legit_examples,
            'suspicious_examples': suspicious_examples
        })
    except Exception as e:
        return jsonify({'database_connection': 'failed', 'error': str(e)}), 500

@app.route('/api/add-legitimate', methods=['POST'])
def add_legitimate():
    data = request.json
    official_url = data.get('official_url')

    if not official_url:
        return jsonify({'error': 'official_url is required'}), 400

    domain = extract_domain(official_url)

    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("""
            INSERT INTO legitimate_sites (official_url)
            VALUES (%s) ON CONFLICT (official_url) DO NOTHING
            RETURNING id
        """, (domain,))

        conn.commit()
        inserted = cur.rowcount > 0

        cur.close()
        conn.close()

        return jsonify({
            'success': inserted,
            'message': 'Added to legitimate sites' if inserted else 'Already exists',
            'domain': domain
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/add-suspicious', methods=['POST'])
def add_suspicious():
    data = request.json
    suspicious_url = data.get('suspicious_url')

    if not suspicious_url:
        return jsonify({'error': 'suspicious_url is required'}), 400

    domain = extract_domain(suspicious_url)

    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("""
            INSERT INTO suspicious_sites (suspicious_url)
            VALUES (%s) ON CONFLICT (suspicious_url) DO NOTHING
            RETURNING id
        """, (domain,))

        conn.commit()
        inserted = cur.rowcount > 0

        cur.close()
        conn.close()

        return jsonify({
            'success': inserted,
            'message': 'Added to suspicious sites' if inserted else 'Already exists',
            'domain': domain
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000, host='0.0.0.0')