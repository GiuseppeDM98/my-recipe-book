import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth } from './config';

/**
 * Firebase Storage Operations for Recipe Images
 *
 * Security Model:
 * - File paths scoped by userId to enable Storage security rules
 * - Path structure: recipes/{userId}/{recipeId}/{filename}
 * - Storage rules restrict access to the user's own recipe path
 *
 * Upload Flow:
 * 1. Validate user authentication
 * 2. Upload to user-scoped path
 * 3. Return public download URL
 *
 * Note: Download URLs are public but path structure prevents guessing
 * other users' file locations. Storage rules enforce access control.
 */

const storage = getStorage();

/**
 * Upload a recipe image to Firebase Storage
 *
 * @param file - Image file to upload
 * @param recipeId - Recipe ID to associate image with
 * @returns Public download URL for the uploaded image
 * @throws Error if user is not authenticated
 *
 * Security:
 * - File path includes userId to scope files by user
 * - Storage rules restrict access to user's own recipes/{userId}/* paths
 * - Download URLs are public but unguessable (contain random tokens)
 * - Direct Storage access remains limited to the authenticated owner path
 */
export async function uploadRecipeImage(file: File, recipeId: string): Promise<string> {
  if (!auth.currentUser) {
    throw new Error('User not authenticated');
  }

  // Path structure: recipes/{userId}/{recipeId}/{filename}
  // userId scoping enables Storage security rules to restrict access:
  // "allow read, write: if request.auth.uid == userId"
  const filePath = `recipes/${auth.currentUser.uid}/${recipeId}/${file.name}`;
  const storageRef = ref(storage, filePath);

  const snapshot = await uploadBytes(storageRef, file);
  const downloadURL = await getDownloadURL(snapshot.ref);

  return downloadURL;
}
