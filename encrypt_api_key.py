import os
import base64
import getpass
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

def main():
    print("=== Secure API Key Encryptor for Quiz Generator ===")
    print("This script encrypts your Gemini API Key so it can be safely embedded in generator.js.\n")
    
    api_key = input("1. Paste your raw Gemini API Key: ").strip()
    if not api_key:
        print("Error: API Key cannot be empty.")
        return

    passcode = getpass.getpass("2. Choose a Passcode (you will share this with users): ").strip()
    if not passcode:
        print("Error: Passcode cannot be empty.")
        return

    # Generate random salt (16 bytes) and IV (12 bytes for GCM)
    salt = os.urandom(16)
    iv = os.urandom(12)

    # Derive the AES key using PBKDF2 (matching generator.js parameters)
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32, # 256 bits
        salt=salt,
        iterations=100000,
    )
    aes_key = kdf.derive(passcode.encode('utf-8'))

    # Encrypt the API key using AES-GCM
    aesgcm = AESGCM(aes_key)
    encrypted_data = aesgcm.encrypt(iv, api_key.encode('utf-8'), None)

    # Encode to Base64 for the JS file
    encrypted_b64 = base64.b64encode(encrypted_data).decode('utf-8')
    iv_b64 = base64.b64encode(iv).decode('utf-8')
    salt_b64 = base64.b64encode(salt).decode('utf-8')

    print("\n✅ Encryption Successful!\n")
    print("Copy the following block and replace the EMBEDDED_KEY object at the top of generator.js:\n")
    print("    const EMBEDDED_KEY = {")
    print(f"        encryptedKeyB64: '{encrypted_b64}',")
    print(f"        ivB64: '{iv_b64}',")
    print(f"        saltB64: '{salt_b64}'")
    print("    };")
    print("\nRemember: Only share the Passcode with people you trust. Do NOT share the raw API key!")

if __name__ == "__main__":
    main()
